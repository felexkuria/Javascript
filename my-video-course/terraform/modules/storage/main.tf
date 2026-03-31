# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# S3 Bucket
resource "aws_s3_bucket" "main" {
  count  = var.create_s3_bucket ? 1 : 0
  bucket = var.s3_bucket_name != "" ? var.s3_bucket_name : "${var.app_name}-video-bucket-${var.environment}-${random_string.suffix[0].result}"

  tags = {
    Name        = "${var.app_name}-storage"
    Environment = var.environment
  }
}

resource "random_string" "suffix" {
  count   = var.create_s3_bucket && var.s3_bucket_name == "" ? 1 : 0
  length  = 8
  special = false
  upper   = false
}

# --- NEW (Universal SOTA): Bucket Resilience & Hardening ---
resource "aws_s3_bucket_versioning" "main" {
  count  = var.create_s3_bucket ? 1 : 0
  bucket = aws_s3_bucket.main[0].id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "main" {
  count  = var.create_s3_bucket ? 1 : 0
  bucket = aws_s3_bucket.main[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "main" {
  count  = var.create_s3_bucket ? 1 : 0
  bucket = aws_s3_bucket.main[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "main" {
  count  = var.create_s3_bucket ? 1 : 0
  bucket = aws_s3_bucket.main[0].id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_cors_configuration" "main" {
  count  = var.create_s3_bucket ? 1 : 0
  bucket = aws_s3_bucket.main[0].id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = var.allowed_origins
    expose_headers  = ["ETag", "x-amz-server-side-encryption", "x-amz-request-id", "x-amz-id-2"]
    max_age_seconds = 3000
  }
}

# --- PILLAR 4: S3 Lifecycle Rules ---
resource "aws_s3_bucket_lifecycle_configuration" "main" {
  count  = var.create_s3_bucket ? 1 : 0
  bucket = aws_s3_bucket.main[0].id

  rule {
    id     = "archive-raw-uploads"
    status = "Enabled"

    filter {
      prefix = "videos/raw/"
    }

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }
  }

  rule {
    id     = "cleanup-incomplete-uploads"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_notification" "main" {
  count  = var.create_s3_bucket ? 1 : 0
  bucket = aws_s3_bucket.main[0].id

  eventbridge = true
}

# Locals for Dynamic Resources
locals {
  dynamodb_tables = {
    videos = {
      hash_key  = "courseName"
      range_key = "videoId"
      attributes = [
        { name = "courseName", type = "S" },
        { name = "videoId", type = "S" }
      ]
      ttl_attribute = null
      gsis = [
        {
          name       = "VideoIdIndex"
          hash_key   = "videoId"
          projection = "ALL"
        },
        {
          name       = "s3Key-index"
          hash_key   = "s3Key"
          projection = "ALL"
        }
      ]
    }
    gamification = {
      hash_key  = "userId"
      range_key = null
      attributes = [
        { name = "userId", type = "S" }
      ]
      ttl_attribute = null
      gsis          = []
    }
    users = {
      hash_key  = "email"
      range_key = null
      attributes = [
        { name = "email", type = "S" }
      ]
      ttl_attribute = null
      gsis          = []
    }
    // New Table: AI Captions & Results Cache
    captions = {
      hash_key  = "courseName"
      range_key = "videoId"
      attributes = [
        { name = "courseName", type = "S" },
        { name = "videoId", type = "S" }
      ]
      ttl_attribute = "expiresAt"
      gsis          = []
    }
  }
}

# DynamoDB Tables (Modular with for_each)
resource "aws_dynamodb_table" "main" {
  for_each     = var.create_dynamodb_tables ? local.dynamodb_tables : {}
  name         = "${var.app_name}-${each.key}-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = each.value.hash_key
  range_key    = each.value.range_key

  dynamic "global_secondary_index" {
    for_each = each.value.gsis
    content {
      name            = global_secondary_index.value.name
      hash_key        = global_secondary_index.value.hash_key
      projection_type = global_secondary_index.value.projection
    }
  }

  dynamic "attribute" {
    for_each = each.value.attributes
    content {
      name = attribute.value.name
      type = attribute.value.type
    }
  }

  dynamic "ttl" {
    for_each = each.value.ttl_attribute != null ? [1] : []
    content {
      attribute_name = each.value.ttl_attribute
      enabled        = true
    }
  }

  tags = {
    Name        = "${var.app_name}-${each.key}"
    Environment = var.environment
  }
}

# DynamoDB IAM Policy (Dynamic with for loop)
resource "aws_iam_policy" "dynamodb_policy" {
  count       = var.create_dynamodb_policy ? 1 : 0
  name        = "${var.app_name}-dynamodb-policy-modular"
  description = "Policy for EC2 to access DynamoDB tables"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:GetRecords",
          "dynamodb:DescribeTable"
        ]
        Resource = var.create_dynamodb_tables ? [
          for table in aws_dynamodb_table.main : table.arn
          ] : [
          "arn:aws:dynamodb:*:*:table/${var.app_name}-*-${var.environment}"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ec2_dynamodb" {
  count      = (var.ec2_role_name != null && (var.create_dynamodb_policy || var.existing_policy_arn != null)) ? 1 : 0
  role       = var.ec2_role_name
  policy_arn = var.create_dynamodb_policy ? aws_iam_policy.dynamodb_policy[0].arn : var.existing_policy_arn
}

# Refactoring: Preservation of data (moved blocks)
moved {
  from = aws_dynamodb_table.videos[0]
  to   = aws_dynamodb_table.main["videos"]
}

moved {
  from = aws_dynamodb_table.gamification[0]
  to   = aws_dynamodb_table.main["gamification"]
}

moved {
  from = aws_dynamodb_table.users[0]
  to   = aws_dynamodb_table.main["users"]
}
