variable "app_name" {
  type = string
}

variable "create_alb" {
  type = bool
}

variable "create_asg" {
  type = bool
}

variable "vpc_id" {
  type = string
}

variable "security_group_ids" {
  type = list(string)
}

variable "subnet_ids" {
  type = list(string)
}

variable "asg_name" {
  type    = string
  default = null
}

variable "scale_up_policy_arns" {
  type    = list(string)
  default = []
}

variable "scale_down_policy_arns" {
  type    = list(string)
  default = []
}

variable "domain_name" {
  type    = string
  default = null
}

variable "hosted_zone_id" {
  type    = string
  default = null
}

variable "enable_https" {
  type    = bool
  default = true
}
