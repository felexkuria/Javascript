variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "app_name" {
  description = "Application name"
  type        = string
  default     = "video-course"
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t2.micro"
}

variable "key_pair_name" {
  description = "AWS key pair name"
  type        = string
}

variable "domain_name" {
  description = "Domain name for the application"
  type        = string
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID"
  type        = string
}

variable "s3_bucket_name" {
  description = "S3 bucket name"
  type        = string
  default     = ""
}


variable "gemini_api_key" {
  description = "Gemini API key"
  type        = string
  sensitive   = true
}

variable "nova_api_key" {
  description = "Nova API key"
  type        = string
  sensitive   = true
}

variable "min_size" {
  description = "Minimum number of instances in ASG"
  type        = number
  default     = 1
}

variable "max_size" {
  description = "Maximum number of instances in ASG"
  type        = number
  default     = 3
}

variable "desired_capacity" {
  description = "Desired number of instances in ASG"
  type        = number
  default     = 1
}

variable "create_cognito_role" {
  description = "Whether to create Cognito IAM role (false to use existing)"
  type        = bool
  default     = true
}

variable "create_ec2_role" {
  description = "Whether to create EC2 IAM role (false to use existing)"
  type        = bool
  default     = true
}

variable "create_ecr_repo" {
  description = "Whether to create ECR repository (false to use existing)"
  type        = bool
  default     = true
}

variable "create_alb" {
  description = "Whether to create Application Load Balancer (false to use existing)"
  type        = bool
  default     = true
}

variable "create_asg" {
  description = "Whether to create Auto Scaling Group (false to use existing)"
  type        = bool
  default     = true
}

variable "create_security_groups" {
  description = "Whether to create Security Groups (false to use existing)"
  type        = bool
  default     = true
}

variable "create_route53_records" {
  description = "Whether to create Route53 records (false to use existing)"
  type        = bool
  default     = true
}

variable "create_lambda_role" {
  description = "Whether to create IAM role for Lambda (false to use existing)"
  type        = bool
  default     = true
}

variable "create_dynamodb_policy" {
  description = "Whether to create IAM policy for DynamoDB (false to use existing)"
  type        = bool
  default     = true
}

variable "create_dynamodb_tables" {
  description = "Whether to create DynamoDB tables (false if they already exist outside Terraform state)"
  type        = bool
  default     = true
}

variable "existing_lambda_role_arn" {
  description = "Existing IAM role ARN for Lambda (if create_lambda_role is false)"
  type        = string
  default     = null
}

variable "existing_dynamodb_policy_arn" {
  description = "Existing IAM policy ARN for DynamoDB (if create_dynamodb_policy is false)"
  type        = string
  default     = null
}

variable "enable_https" {
  description = "Whether to enable HTTPS (requires ACM certificate and Route53)"
  type        = bool
  default     = true
}

variable "existing_alb_name" {
  description = "Name of existing ALB to use (if create_alb is false)"
  type        = string
  default     = ""
}

variable "existing_asg_name" {
  description = "Name of existing ASG to use (if create_asg is false)"
  type        = string
  default     = ""
}

variable "existing_alb_sg_name" {
  description = "Name of existing ALB security group (if create_security_groups is false)"
  type        = string
  default     = ""
}

variable "existing_ec2_sg_name" {
  description = "Name of existing EC2 security group (if create_security_groups is false)"
  type        = string
  default     = ""
}
variable "create_vpc" {
  description = "Whether to create a new VPC (false to use existing)"
  type        = bool
  default     = true
}

variable "create_cognito" {
  description = "Whether to create new Cognito User Pool (false to use existing)"
  type        = bool
  default     = true
}

variable "create_s3_bucket" {
  description = "Whether to create a new S3 bucket (false to use existing)"
  type        = bool
  default     = true
}



variable "session_secret" {
  description = "Secret for Express sessions"
  type        = string
  sensitive   = true
  default     = "placeholder-secret-change-me"
}

variable "admin_key" {
  description = "Administrative API key"
  type        = string
  sensitive   = true
  default     = "admin123"
}

variable "mongodb_uri" {
  description = "MongoDB connection string"
  type        = string
  sensitive   = true
  default     = ""
}
