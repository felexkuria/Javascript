output "alb_dns_name" {
  value = var.create_alb ? aws_lb.app[0].dns_name : null
}

output "alb_arn" {
  value = var.create_alb ? aws_lb.app[0].arn : null
}

output "target_group_arn" {
  value = var.create_alb ? aws_lb_target_group.app[0].arn : null
}
