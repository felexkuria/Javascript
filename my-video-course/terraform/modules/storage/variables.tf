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
