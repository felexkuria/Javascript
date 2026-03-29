variable "vpc_id" {
  type = string
}

variable "app_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "create_security_groups" {
  type = bool
}

variable "create_cognito" {
  type = bool
}

variable "create_ec2_role" {
  type = bool
}

variable "s3_bucket_arn" {
  type    = string
  default = "*"
}

variable "dynamodb_table_arns" {
  type    = list(string)
  default = []
}

variable "create_cognito_role" {
  type    = bool
  default = true
}
variable "create_app_secrets" {
  type = bool
}
variable "app_secrets_id" {
  type = string
}

variable "gemini_api_key" {
  type      = string
  sensitive = true
  default   = ""
}

variable "nova_api_key" {
  type      = string
  sensitive = true
  default   = ""
}

variable "mongodb_uri" {
  type      = string
  sensitive = true
  default   = ""
}

variable "session_secret" {
  type      = string
  sensitive = true
  default   = ""
}

variable "admin_key" {
  type      = string
  sensitive = true
  default   = ""
}
