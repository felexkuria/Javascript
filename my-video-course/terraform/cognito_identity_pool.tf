# Cognito Identity Pool for direct AWS access
resource "aws_cognito_identity_pool" "main" {
  identity_pool_name               = "video-course-app-identity-pool"
  allow_unauthenticated_identities = false

  cognito_identity_providers {
    client_id               = data.aws_cognito_user_pool_client.existing.id
    provider_name           = "cognito-idp.us-east-1.amazonaws.com/${data.aws_cognito_user_pool.existing.id}"
    server_side_token_check = false
  }

  tags = {
    Name = "video-course-app-identity-pool"
  }
}

# IAM role for authenticated users
resource "aws_iam_role" "authenticated" {
  name = "video-course-cognito-authenticated-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = "cognito-identity.amazonaws.com"
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "cognito-identity.amazonaws.com:aud" = aws_cognito_identity_pool.main.id
          }
          "ForAnyValue:StringLike" = {
            "cognito-identity.amazonaws.com:amr" = "authenticated"
          }
        }
      }
    ]
  })
}

# Policy for authenticated users
resource "aws_iam_role_policy" "authenticated" {
  name = "video-course-cognito-authenticated-policy"
  role = aws_iam_role.authenticated.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject"
        ]
        Resource = "arn:aws:s3:::video-course-bucket-047ad47c/uploads/*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query"
        ]
        Resource = [
          aws_dynamodb_table.gamification.arn,
          aws_dynamodb_table.users.arn
        ]
        Condition = {
          "ForAllValues:StringEquals" = {
            "dynamodb:LeadingKeys" = ["$${cognito-identity.amazonaws.com:sub}"]
          }
        }
      }
    ]
  })
}

# Attach roles to identity pool
resource "aws_cognito_identity_pool_roles_attachment" "main" {
  identity_pool_id = aws_cognito_identity_pool.main.id

  roles = {
    "authenticated" = aws_iam_role.authenticated.arn
  }
}