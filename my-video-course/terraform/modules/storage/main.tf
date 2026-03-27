# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# S3 Bucket
resource "aws_s3_bucket" "main" {
  count  = var.create_s3_bucket ? 1 : 0
  bucket = "${var.app_name}-video-bucket-${var.environment}-${random_string.suffix.result}"
}

resource "random_string" "suffix" {
  length  = 8
  special = false
  upper   = false
}

resource "aws_s3_bucket_cors_configuration" "main" {
  count  = var.create_s3_bucket ? 1 : 0
  bucket = aws_s3_bucket.main[0].id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE"]
    allowed_origins = var.allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
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
    }
    gamification = {
      hash_key  = "userId"
      range_key = null
      attributes = [
        { name = "userId", type = "S" }
      ]
    }
    users = {
      hash_key  = "email"
      range_key = null
      attributes = [
        { name = "email", type = "S" }
      ]
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

  dynamic "attribute" {
    for_each = each.value.attributes
    content {
      name = attribute.value.name
      type = attribute.value.type
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
          "dynamodb:Scan"
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
