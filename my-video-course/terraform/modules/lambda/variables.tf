variable "app_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "s3_bucket_name" {
  type = string
}

variable "s3_bucket_arn" {
  type = string
}

variable "dynamodb_table_arn" {
  description = "The ARN of the DynamoDB table"
  type        = string
}

variable "dynamodb_table_name" {
  description = "The name of the DynamoDB table (used for environment variables)"
  type        = string
}

variable "aws_region" {
  description = "The AWS region to deploy to"
  type        = string
  default     = "us-east-1"
}

variable "create_role" {
  type    = bool
  default = true
}

variable "existing_role_arn" {
  type    = string
  default = null
}
