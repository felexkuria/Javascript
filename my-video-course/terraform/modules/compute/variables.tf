variable "app_name" {
  type = string
}

variable "create_ecr_repo" {
  type = bool
}
variable "image_tag" {
  description = "The Docker image tag to deploy"
  type        = string
}
variable "create_asg" {
  type = bool
}

variable "ami_id" {
  type = string
}

variable "instance_type" {
  type = string
}

variable "key_pair_name" {
  type = string
}

variable "security_group_ids" {
  type = list(string)
}

variable "iam_instance_profile_name" {
  type = string
}

variable "user_data_base64" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "target_group_arns" {
  type = list(string)
}

variable "min_size" {
  type = number
}

variable "max_size" {
  type = number
}

variable "desired_capacity" {
  type = number
}
