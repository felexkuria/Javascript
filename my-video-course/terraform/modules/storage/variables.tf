variable "app_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "create_s3_bucket" {
  type = bool
}

variable "allowed_origins" {
  type    = list(string)
  default = ["http://localhost:3000"]
}

variable "ec2_role_name" {
  type    = string
  default = null
}

variable "create_dynamodb_tables" {
  description = "Whether to create DynamoDB tables (set false if tables already exist outside Terraform state)"
  type        = bool
  default     = true
}

variable "create_dynamodb_policy" {
  type    = bool
  default = true
}

variable "existing_policy_arn" {
  type    = string
  default = null
}

variable "s3_bucket_name" {
  description = "Custom S3 bucket name (optional)"
  type        = string
  default     = ""
}
