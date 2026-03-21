output "alb_security_group_id" {
  value = var.create_security_groups ? aws_security_group.alb_new[0].id : null
}

output "ec2_security_group_id" {
  value = var.create_security_groups ? aws_security_group.ec2_new[0].id : null
}

output "cognito_user_pool_id" {
  value = var.create_cognito ? aws_cognito_user_pool.main[0].id : null
}

output "cognito_user_pool_arn" {
  value = var.create_cognito ? aws_cognito_user_pool.main[0].arn : null
}

output "cognito_client_id" {
  value = var.create_cognito ? aws_cognito_user_pool_client.main[0].id : null
}

output "cognito_identity_pool_id" {
  value = var.create_cognito ? aws_cognito_identity_pool.main[0].id : null
}

output "ec2_role_name" {
  value = var.create_ec2_role ? aws_iam_role.ec2_role[0].name : null
}

output "ec2_instance_profile_name" {
  value = var.create_ec2_role ? aws_iam_instance_profile.ec2_profile[0].name : null
}
