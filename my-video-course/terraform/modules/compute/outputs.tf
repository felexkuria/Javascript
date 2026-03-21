output "ecr_repository_url" {
  value = var.create_ecr_repo ? aws_ecr_repository.main[0].repository_url : null
}

output "asg_name" {
  value = var.create_asg ? aws_autoscaling_group.app[0].name : null
}

output "scale_up_policy_arn" {
  value = var.create_asg ? aws_autoscaling_policy.scale_up[0].arn : null
}

output "scale_down_policy_arn" {
  value = var.create_asg ? aws_autoscaling_policy.scale_down[0].arn : null
}
