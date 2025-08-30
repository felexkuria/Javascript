# Import existing resources instead of creating new ones

# Existing Cognito User Pool
data "aws_cognito_user_pool" "existing" {
  user_pool_id = "us-east-1_vX8VZrTKQ"
}

# Existing Cognito User Pool Client  
data "aws_cognito_user_pool_client" "existing" {
  client_id    = "4t7m43e0pvmvc2v7rfv72dv69j"
  user_pool_id = data.aws_cognito_user_pool.existing.id
}



# Existing S3 Bucket
data "aws_s3_bucket" "existing" {
  bucket = "video-course-bucket-047ad47c"
}

# Existing ECR Repository (if exists)
data "aws_ecr_repository" "existing" {
  name = "video-course-app"
}

# Existing IAM Roles (if they exist)
data "aws_iam_role" "existing_ec2_role" {
  name = "video-course-app-ec2-role"
}

# Existing Load Balancer (if exists)
data "aws_lb" "existing" {
  count = var.create_alb ? 0 : 1
  arn   = "arn:aws:elasticloadbalancing:us-east-1:767397885043:loadbalancer/app/video-course-app-alb/df6da37405dfe86b"
}

# Existing Auto Scaling Group (if exists)
data "aws_autoscaling_group" "existing" {
  count = var.create_asg ? 0 : 1
  name  = "video-course-app-asg"
}

# Existing Security Groups (if they exist)
data "aws_security_group" "existing_alb_sg" {
  count = var.create_security_groups ? 0 : 1
  id    = "sg-0b49a8604369c68a9"
}

data "aws_security_group" "existing_ec2_sg" {
  count = var.create_security_groups ? 0 : 1
  id    = "sg-0459a70ee2fda5644"
}

