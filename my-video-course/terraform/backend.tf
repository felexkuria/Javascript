terraform {
  backend "s3" {
    bucket = "terraform-state-video-course-shared"
    key    = "video-course/terraform.tfstate"
    region = "us-east-1"
    
    # Enable state locking
    dynamodb_table = "terraform-state-lock"
    encrypt        = true
  }
}