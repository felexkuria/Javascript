# Terraform Backend Configuration
# Uncomment and configure after creating S3 bucket via GitHub Actions

# terraform {
#   backend "s3" {
#     bucket = "terraform-state-video-course-XXXXXXXXXX"
#     key    = "terraform.tfstate"
#     region = "us-east-1"
#   }
# }