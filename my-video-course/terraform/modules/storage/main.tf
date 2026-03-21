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

# DynamoDB Tables
resource "aws_dynamodb_table" "videos" {
  name           = "${var.app_name}-videos-${var.environment}"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "courseName"
  range_key      = "videoId"

  attribute {
    name = "courseName"
    type = "S"
  }

  attribute {
    name = "videoId"
    type = "S"
  }

  tags = {
    Name        = "${var.app_name}-videos"
    Environment = var.environment
  }
}

resource "aws_dynamodb_table" "gamification" {
  name         = "${var.app_name}-gamification-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

  attribute {
    name = "userId"
    type = "S"
  }

  tags = {
    Name        = "${var.app_name}-gamification"
    Environment = var.environment
  }
}

resource "aws_dynamodb_table" "users" {
  name         = "${var.app_name}-users-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "email"

  attribute {
    name = "email"
    type = "S"
  }

  tags = {
    Name        = "${var.app_name}-users"
    Environment = var.environment
  }
}

# DynamoDB IAM Policy
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
        Resource = [
          aws_dynamodb_table.videos.arn,
          aws_dynamodb_table.gamification.arn,
          aws_dynamodb_table.users.arn
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
