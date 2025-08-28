terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# Data sources
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]
  
  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }
}

# Use existing VPC
data "aws_vpc" "existing" {
  id = "vpc-0357f6ce9238d73be"
}

data "aws_subnets" "existing" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.existing.id]
  }
}

# Use existing subnets
data "aws_subnet" "existing" {
  count = length(data.aws_subnets.existing.ids)
  id    = data.aws_subnets.existing.ids[count.index]
}



# Get existing security groups
data "aws_security_group" "alb_sg" {
  id = "sg-0b49a8604369c68a9"
}

data "aws_security_group" "ec2_sg" {
  id = "sg-0459a70ee2fda5644"
}

# Local values for resource references
locals {
  alb_security_group_id = data.aws_security_group.alb_sg.id
  ec2_security_group_id = data.aws_security_group.ec2_sg.id
  load_balancer_arn     = data.aws_lb.main.arn
  load_balancer_dns     = data.aws_lb.main.dns_name
  load_balancer_zone_id = data.aws_lb.main.zone_id
  target_group_arn      = data.aws_lb_target_group.app.arn
}

# Use existing Cognito resources
locals {
  cognito_user_pool_id = data.aws_cognito_user_pool.existing.id
  cognito_client_id    = data.aws_cognito_user_pool_client.existing.id
}



# Use existing ECR repository or create if needed
resource "aws_ecr_repository" "main" {
  count                = var.create_ecr_repo ? 1 : 0
  name                 = "video-course-app"
  image_tag_mutability = "MUTABLE"
  force_delete         = true
  
  image_scanning_configuration {
    scan_on_push = true
  }
  
  tags = {
    Name = "${var.app_name}-ecr"
  }
}

locals {
  ecr_repository_url = var.create_ecr_repo ? aws_ecr_repository.main[0].repository_url : data.aws_ecr_repository.existing.repository_url
}

# Use existing S3 bucket
locals {
  s3_bucket_name = data.aws_s3_bucket.existing.bucket
  s3_bucket_arn  = data.aws_s3_bucket.existing.arn
}

# S3 bucket configurations (skip if using existing bucket)
# Uncomment if you need to configure the existing bucket
# resource "aws_s3_bucket_cors_configuration" "main" {
#   bucket = local.s3_bucket_name
#   
#   cors_rule {
#     allowed_headers = ["*"]
#     allowed_methods = ["GET", "PUT", "POST", "DELETE"]
#     allowed_origins = ["https://${var.domain_name}"]
#     expose_headers  = ["ETag"]
#     max_age_seconds = 3000
#   }
# }

# IAM Role for EC2 - use existing or create new
resource "aws_iam_role" "ec2_role" {
  count = var.create_ec2_role ? 1 : 0
  name = "${var.app_name}-ec2-role"
  
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

locals {
  ec2_role_name = var.create_ec2_role ? aws_iam_role.ec2_role[0].name : data.aws_iam_role.existing_ec2_role.name
  ec2_role_arn  = var.create_ec2_role ? aws_iam_role.ec2_role[0].arn : data.aws_iam_role.existing_ec2_role.arn
}

resource "aws_iam_role_policy" "ec2_policy" {
  count = var.create_ec2_role ? 1 : 0
  name = "${var.app_name}-ec2-policy"
  role = aws_iam_role.ec2_role[0].id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${local.s3_bucket_arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = local.s3_bucket_arn
      },
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:*"
        ]
        Resource = data.aws_cognito_user_pool.existing.arn
      },
      {
        Effect = "Allow"
        Action = [
          "transcribe:*"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel"
        ]
        Resource = "arn:aws:bedrock:*::foundation-model/amazon.nova-lite-v1:0"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "ec2_profile" {
  count = var.create_ec2_role ? 1 : 0
  name = "${var.app_name}-ec2-profile"
  role = local.ec2_role_name
}

locals {
  ec2_instance_profile_name = var.create_ec2_role ? aws_iam_instance_profile.ec2_profile[0].name : "${var.app_name}-ec2-profile"
}

# Launch Template
resource "aws_launch_template" "app" {
  count         = var.create_asg ? 1 : 0
  name_prefix   = "${var.app_name}-"
  image_id      = data.aws_ami.amazon_linux.id
  instance_type = var.instance_type
  key_name      = var.key_pair_name
  
  vpc_security_group_ids = [local.ec2_security_group_id]
  
  iam_instance_profile {
    name = local.ec2_instance_profile_name
  }
  
  user_data = base64encode(templatefile("${path.module}/user_data.sh", {
    mongodb_uri              = var.mongodb_uri
    aws_access_key_id        = var.aws_access_key_id
    aws_secret_access_key    = var.aws_secret_access_key
    aws_region               = var.aws_region
    s3_bucket_name           = var.s3_bucket_name
    gemini_api_key           = var.gemini_api_key
    nova_api_key             = var.nova_api_key
    cognito_user_pool_id     = local.cognito_user_pool_id
    cognito_client_id        = local.cognito_client_id

  }))
  
  tag_specifications {
    resource_type = "instance"
    tags = {
      Name = "${var.app_name}-instance"
    }
  }
}

# Use existing ALB and Target Group
data "aws_lb" "main" {
  name = "${var.app_name}-alb"
}

data "aws_lb_target_group" "app" {
  name = "${var.app_name}-tg"
}



# Auto Scaling Group (conditional creation)
resource "aws_autoscaling_group" "app" {
  count               = var.create_asg ? 1 : 0
  name                = "${var.app_name}-asg"
  vpc_zone_identifier = data.aws_subnets.existing.ids
  target_group_arns   = [local.target_group_arn]
  health_check_type   = "ELB"
  health_check_grace_period = 300
  
  min_size         = var.min_size
  max_size         = var.max_size
  desired_capacity = var.desired_capacity
  
  launch_template {
    id      = aws_launch_template.app[0].id
    version = "$Latest"
  }
  
  tag {
    key                 = "Name"
    value               = "${var.app_name}-asg"
    propagate_at_launch = false
  }
  
  lifecycle {
    prevent_destroy = true
  }
}

# Auto Scaling Policies (conditional creation)
resource "aws_autoscaling_policy" "scale_up" {
  count                  = var.create_asg ? 1 : 0
  name                   = "${var.app_name}-scale-up"
  scaling_adjustment     = 1
  adjustment_type        = "ChangeInCapacity"
  cooldown               = 300
  autoscaling_group_name = aws_autoscaling_group.app[0].name
}

resource "aws_autoscaling_policy" "scale_down" {
  count                  = var.create_asg ? 1 : 0
  name                   = "${var.app_name}-scale-down"
  scaling_adjustment     = -1
  adjustment_type        = "ChangeInCapacity"
  cooldown               = 300
  autoscaling_group_name = aws_autoscaling_group.app[0].name
}

# Use existing ACM Certificate
data "aws_acm_certificate" "existing" {
  domain   = var.domain_name
  statuses = ["ISSUED"]
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
  
  lifecycle {
    prevent_destroy = true
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
  
  lifecycle {
    prevent_destroy = true
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
  
  lifecycle {
    prevent_destroy = true
  }
}

# DynamoDB IAM Policy for EC2
resource "aws_iam_policy" "dynamodb_policy" {
  name = "${var.app_name}-dynamodb-policy"

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
  role       = local.ec2_role_name
  policy_arn = aws_iam_policy.dynamodb_policy.arn
}

# CloudWatch Alarms (conditional creation)
resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  count               = var.create_asg ? 1 : 0
  alarm_name          = "${var.app_name}-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = "120"
  statistic           = "Average"
  threshold           = "70"
  alarm_description   = "This metric monitors ec2 cpu utilization"
  alarm_actions       = [aws_autoscaling_policy.scale_up[0].arn]
  
  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.app[0].name
  }
}

resource "aws_cloudwatch_metric_alarm" "cpu_low" {
  count               = var.create_asg ? 1 : 0
  alarm_name          = "${var.app_name}-cpu-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = "120"
  statistic           = "Average"
  threshold           = "30"
  alarm_description   = "This metric monitors ec2 cpu utilization"
  alarm_actions       = [aws_autoscaling_policy.scale_down[0].arn]
  
  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.app[0].name
  }
}