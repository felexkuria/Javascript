output "load_balancer_dns" {
  description = "DNS name of the load balancer"
  value       = local.load_balancer_dns
}

output "load_balancer_url" {
  description = "URL of the application"
  value       = "https://${var.domain_name}"
}

output "certificate_arn" {
  description = "ARN of the ACM certificate"
  value       = data.aws_acm_certificate.existing.arn
}

output "domain_name" {
  description = "Domain name of the application"
  value       = var.domain_name
}

output "vpc_id" {
  description = "ID of the existing VPC"
  value       = data.aws_vpc.existing.id
}

output "subnet_ids" {
  description = "IDs of the existing subnets"
  value       = data.aws_subnets.existing.ids
}

output "autoscaling_group_name" {
  description = "Name of the Auto Scaling Group"
  value       = var.create_asg ? aws_autoscaling_group.app[0].name : var.existing_asg_name
}

output "security_group_alb_id" {
  description = "ID of the ALB security group"
  value       = local.alb_security_group_id
}

output "security_group_ec2_id" {
  description = "ID of the EC2 security group"
  value       = local.ec2_security_group_id
}

output "s3_bucket_name" {
  description = "Name of the S3 bucket"
  value       = local.s3_bucket_name
}

output "s3_bucket_arn" {
  description = "ARN of the S3 bucket"
  value       = local.s3_bucket_arn
}

output "cognito_user_pool_id" {
  description = "ID of the Cognito User Pool"
  value       = local.cognito_user_pool_id
}

output "cognito_user_pool_client_id" {
  description = "ID of the Cognito User Pool Client"
  value       = local.cognito_client_id
}



output "target_group_arn" {
  description = "ARN of the target group"
  value       = local.target_group_arn
}

output "dynamodb_tables" {
  description = "DynamoDB table names"
  value = {
    videos_table       = aws_dynamodb_table.videos.name
    gamification_table = aws_dynamodb_table.gamification.name
    users_table        = aws_dynamodb_table.users.name
  }
}

output "dynamodb_table_arns" {
  description = "DynamoDB table ARNs"
  value = {
    videos_arn       = aws_dynamodb_table.videos.arn
    gamification_arn = aws_dynamodb_table.gamification.arn
    users_arn        = aws_dynamodb_table.users.arn
  }
}