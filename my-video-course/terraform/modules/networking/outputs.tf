output "vpc_id" {
  value = var.create_vpc ? aws_vpc.main[0].id : null
}

output "public_subnet_ids" {
  value = var.create_vpc ? aws_subnet.public[*].id : []
}
