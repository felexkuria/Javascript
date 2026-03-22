terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket = "terraform-state-bucket-2026-felexirunguvault"
    key    = "video-course-app/terraform.tfstate"
    region = "us-east-1"
  }
}

provider "aws" {
  region = var.aws_region
}

# Data sources
data "aws_caller_identity" "current" {}

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

# Modules
module "networking" {
  source             = "./modules/networking"
  create_vpc         = var.create_vpc
  vpc_cidr           = var.vpc_cidr
  app_name           = var.app_name
  availability_zones = data.aws_availability_zones.available.names
}

module "security" {
  source                 = "./modules/security"
  vpc_id                 = module.networking.vpc_id
  app_name               = var.app_name
  environment            = var.environment
  create_security_groups = var.create_security_groups
  create_cognito         = var.create_cognito
  create_ec2_role        = var.create_ec2_role
  create_cognito_role    = var.create_cognito ? var.create_cognito_role : false
  s3_bucket_arn          = module.storage.s3_bucket_arn
  dynamodb_table_arns = [
    module.storage.dynamodb_videos_arn,
    module.storage.dynamodb_gamification_arn,
    module.storage.dynamodb_users_arn
  ]
}

module "storage" {
  source                 = "./modules/storage"
  app_name               = var.app_name
  environment            = var.environment
  create_s3_bucket       = var.create_s3_bucket
  create_dynamodb_tables = var.create_dynamodb_tables
  allowed_origins        = ["https://${var.domain_name}", "http://localhost:3000"]
  ec2_role_name          = module.security.ec2_role_name
  create_dynamodb_policy = var.create_dynamodb_policy
  existing_policy_arn    = var.existing_dynamodb_policy_arn
}

module "loadbalancing" {
  source                 = "./modules/loadbalancing"
  app_name               = var.app_name
  create_alb             = var.create_alb
  create_asg             = var.create_asg
  vpc_id                 = module.networking.vpc_id
  security_group_ids     = [module.security.alb_security_group_id]
  subnet_ids             = module.networking.public_subnet_ids
  asg_name               = module.compute.asg_name
  scale_up_policy_arns   = [module.compute.scale_up_policy_arn]
  scale_down_policy_arns = [module.compute.scale_down_policy_arn]
  domain_name            = var.domain_name
  hosted_zone_id         = var.hosted_zone_id
  enable_https           = var.enable_https
  create_route53_records = var.create_route53_records
}

module "compute" {
  source                    = "./modules/compute"
  app_name                  = var.app_name
  create_ecr_repo           = var.create_ecr_repo
  create_asg                = var.create_asg
  ami_id                    = data.aws_ami.amazon_linux.id
  instance_type             = var.instance_type
  key_pair_name             = var.key_pair_name
  security_group_ids        = [module.security.ec2_security_group_id]
  iam_instance_profile_name = module.security.ec2_instance_profile_name
  subnet_ids                = module.networking.public_subnet_ids
  target_group_arns         = [module.loadbalancing.target_group_arn]
  min_size                  = var.min_size
  max_size                  = var.max_size
  desired_capacity          = var.desired_capacity
  user_data_base64 = base64encode(templatefile("${path.module}/user_data.sh", {
    aws_region           = var.aws_region
    s3_bucket_name       = module.storage.s3_bucket_name
    account_id           = data.aws_caller_identity.current.account_id
    gemini_api_key       = var.gemini_api_key
    nova_api_key         = var.nova_api_key
    cognito_user_pool_id = module.security.cognito_user_pool_id
    cognito_client_id    = module.security.cognito_client_id
  }))
}

module "lambda" {
  source              = "./modules/lambda"
  app_name            = var.app_name
  environment         = var.environment
  s3_bucket_name      = module.storage.s3_bucket_name
  s3_bucket_arn       = module.storage.s3_bucket_arn
  dynamodb_table_name = "${var.app_name}-videos-${var.environment}"
  create_role         = var.create_lambda_role
  existing_role_arn   = var.existing_lambda_role_arn
}
