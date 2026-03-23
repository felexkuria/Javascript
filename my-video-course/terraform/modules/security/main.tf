# Security Groups
resource "aws_security_group" "alb_new" {
  count       = var.create_security_groups ? 1 : 0
  name        = "${var.app_name}-alb-sg-modular"
  description = "Security group for ALB"
  vpc_id      = var.vpc_id

  ingress {
    protocol    = "tcp"
    from_port   = 80
    to_port     = 80
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    protocol    = "tcp"
    from_port   = 443
    to_port     = 443
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "ec2_new" {
  count       = var.create_security_groups ? 1 : 0
  name        = "${var.app_name}-ecs-sg-modular"
  description = "Security group for EC2/ECS tasks"
  vpc_id      = var.vpc_id

  ingress {
    protocol        = "tcp"
    from_port       = 3000
    to_port         = 3000
    security_groups = [aws_security_group.alb_new[0].id]
  }

  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Cognito
resource "aws_cognito_user_pool" "main" {
  count = var.create_cognito ? 1 : 0
  name  = "${var.app_name}-user-pool"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  schema {
    name                     = "email"
    attribute_data_type      = "String"
    developer_only_attribute = false
    mutable                  = true
    required                 = true
    string_attribute_constraints {
      min_length = "0"
      max_length = "2048"
    }
  }
}

resource "aws_cognito_user_pool_client" "main" {
  count           = var.create_cognito ? 1 : 0
  name            = "${var.app_name}-client"
  user_pool_id    = aws_cognito_user_pool.main[0].id
  generate_secret = false
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]
}

# IAM Roles
resource "aws_iam_role" "ec2_role" {
  count = var.create_ec2_role ? 1 : 0
  name  = "${var.app_name}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_instance_profile" "ec2_profile" {
  count = var.create_ec2_role ? 1 : 0
  name  = "${var.app_name}-ec2-profile"
  role  = aws_iam_role.ec2_role[0].name
}

# IAM Policy attachments for EC2
resource "aws_iam_role_policy_attachment" "ec2_ecr" {
  count      = var.create_ec2_role ? 1 : 0
  role       = aws_iam_role.ec2_role[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

resource "aws_iam_role_policy_attachment" "ec2_ssm" {
  count      = var.create_ec2_role ? 1 : 0
  role       = aws_iam_role.ec2_role[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "ec2_cognito" {
  count      = var.create_ec2_role ? 1 : 0
  role       = aws_iam_role.ec2_role[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonCognitoPowerUser"
}

resource "aws_iam_role_policy_attachment" "ec2_dynamodb" {
  count      = var.create_ec2_role ? 1 : 0
  role       = aws_iam_role.ec2_role[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
}

resource "aws_iam_role_policy_attachment" "ec2_s3" {
  count      = var.create_ec2_role ? 1 : 0
  role       = aws_iam_role.ec2_role[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonS3FullAccess"
}

# Cognito Identity Pool
resource "aws_cognito_identity_pool" "main" {
  count                            = var.create_cognito ? 1 : 0
  identity_pool_name               = "${var.app_name}-identity-pool"
  allow_unauthenticated_identities = false

  cognito_identity_providers {
    client_id               = aws_cognito_user_pool_client.main[0].id
    provider_name           = "cognito-idp.us-east-1.amazonaws.com/${aws_cognito_user_pool.main[0].id}"
    server_side_token_check = false
  }

  tags = {
    Name = "${var.app_name}-identity-pool"
  }
}

# IAM role for authenticated users
resource "aws_iam_role" "authenticated" {
  count = var.create_cognito_role ? 1 : 0
  name  = "${var.app_name}-cognito-auth-role"

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
            "cognito-identity.amazonaws.com:aud" = aws_cognito_identity_pool.main[0].id
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
  count = var.create_cognito_role ? 1 : 0
  name  = "${var.app_name}-cognito-auth-policy"
  role  = aws_iam_role.authenticated[0].id

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
        Resource = [
          "${var.s3_bucket_arn}/uploads/*",
          "${var.s3_bucket_arn}/videos/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query"
        ]
        Resource = var.dynamodb_table_arns
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
  count            = var.create_cognito_role ? 1 : 0
  identity_pool_id = aws_cognito_identity_pool.main[0].id

  roles = {
    "authenticated" = aws_iam_role.authenticated[0].arn
  }
}
