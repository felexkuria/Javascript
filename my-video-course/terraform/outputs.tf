output "load_balancer_dns" {
  description = "DNS name of the load balancer"
  value       = module.loadbalancing.alb_dns_name
}

output "load_balancer_url" {
  description = "URL of the application"
  value       = "https://${var.domain_name}"
}

output "vpc_id" {
  description = "ID of the VPC"
  value       = module.networking.vpc_id
}

output "subnet_ids" {
  description = "IDs of the subnets"
  value       = module.networking.public_subnet_ids
}

output "cognito_user_pool_id" {
  description = "ID of the Cognito User Pool"
  value       = module.security.cognito_user_pool_id
}

output "cognito_user_pool_client_id" {
  description = "ID of the Cognito User Pool Client"
  value       = module.security.cognito_client_id
}

output "cognito_identity_pool_id" {
  description = "Cognito Identity Pool ID"
  value       = module.security.cognito_identity_pool_id
}

output "s3_bucket_name" {
  description = "Name of the S3 bucket"
  value       = module.storage.s3_bucket_name
}

output "ecr_repository_url" {
  description = "URL of the ECR repository"
  value       = module.compute.ecr_repository_url
}

output "autoscaling_group_name" {
  description = "Name of the Auto Scaling Group"
  value       = module.compute.asg_name
}
