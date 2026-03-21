output "s3_bucket_name" {
  value = var.create_s3_bucket ? aws_s3_bucket.main[0].bucket : null
}

output "s3_bucket_arn" {
  value = var.create_s3_bucket ? aws_s3_bucket.main[0].arn : null
}

output "dynamodb_videos_arn" {
  value = aws_dynamodb_table.videos.arn
}

output "dynamodb_gamification_arn" {
  value = aws_dynamodb_table.gamification.arn
}

output "dynamodb_users_arn" {
  value = aws_dynamodb_table.users.arn
}
