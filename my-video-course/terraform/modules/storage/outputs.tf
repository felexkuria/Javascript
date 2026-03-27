output "s3_bucket_name" {
  value = var.create_s3_bucket ? aws_s3_bucket.main[0].bucket : null
}

output "s3_bucket_arn" {
  value = var.create_s3_bucket ? aws_s3_bucket.main[0].arn : null
}

output "dynamodb_videos_arn" {
  value = var.create_dynamodb_tables ? aws_dynamodb_table.main["videos"].arn : "arn:aws:dynamodb:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:table/${var.app_name}-videos-${var.environment}"
}

output "dynamodb_gamification_arn" {
  value = var.create_dynamodb_tables ? aws_dynamodb_table.main["gamification"].arn : "arn:aws:dynamodb:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:table/${var.app_name}-gamification-${var.environment}"
}

output "dynamodb_users_arn" {
  value = var.create_dynamodb_tables ? aws_dynamodb_table.main["users"].arn : "arn:aws:dynamodb:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:table/${var.app_name}-users-${var.environment}"
}
