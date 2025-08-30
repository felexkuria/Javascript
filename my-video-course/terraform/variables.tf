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

variable "mongodb_uri" {
  description = "MongoDB connection URI"
  type        = string
  sensitive   = true
}

variable "aws_access_key_id" {
  description = "AWS access key ID"
  type        = string
  sensitive   = true
}

variable "aws_secret_access_key" {
  description = "AWS secret access key"
  type        = string
  sensitive   = true
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
  default     = false
}

variable "create_ec2_role" {
  description = "Whether to create EC2 IAM role (false to use existing)"
  type        = bool
  default     = false
}

variable "create_ecr_repo" {
  description = "Whether to create ECR repository (false to use existing)"
  type        = bool
  default     = false
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