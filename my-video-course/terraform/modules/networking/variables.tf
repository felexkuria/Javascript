variable "create_vpc" {
  type    = bool
  default = true
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "app_name" {
  type = string
}

variable "availability_zones" {
  type = list(string)
}
