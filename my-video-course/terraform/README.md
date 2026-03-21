# Video Course Platform - Terraform Deployment (Modular)

## 🏗️ New Modular Architecture
The infrastructure is now organized into specialized modules for better maintainability:

- **`modules/networking`**: VPC, Subnets, Internet Gateway, and Route Tables.
- **`modules/security`**: Cognito (User/Identity Pools), IAM Roles, and Security Groups.
- **`modules/storage`**: S3 Buckets and DynamoDB tables (Videos, Users, Gamification).
- **`modules/compute`**: Auto Scaling Group, Launch Template, and ECR Repository.
- **`modules/loadbalancing`**: Application Load Balancer, Target Groups, and CloudWatch Alarms.
- **`modules/lambda`**: Automation for Transcribe and Database synchronization.

## 🚀 Deployment Steps

### 1. Prerequisites
```bash
brew install terraform awscli docker colima
aws configure
```

### 2. Configure Variables
Copy `terraform.tfvars.example` to `terraform.tfvars` and fill in your secrets.
> [!WARNING]
> `terraform.tfvars` contains sensitive keys. It is included in `.gitignore` to prevent accidental commits. If you have already committed secrets, rotate your AWS and MongoDB keys immediately.

### 3. Deploy
```bash
cd terraform
terraform init
terraform apply
```

## 🛠️ Key Files Explained

### `user_data.sh`
This script runs automatically when an EC2 instance starts. It:
1.  Installs **Docker** and AWS CLI.
2.  Creates a local `.env` file with secrets passed from Terraform.
3.  Logs into **ECR** and pulls your application image.
4.  Starts the application container.

### ECR (Elastic Container Registry)
Even if you upload videos via the browser, your **Backend Application** is packaged as a Docker image. ECR is the "garage" where this image is stored. The EC2 instances pull the app from ECR to run it.

## 🔐 Security & State
- **gitignore**: `.tfvars` and `.tfstate` files are ignored to keep secrets out of Version Control.
- **State Lock**: Terraform uses local state locking to prevent concurrent modification.
- **Secret Zero**: No hardcoded AWS keys are used within the application code; they are injected via environment variables during bootstrap.

## 🧹 Cleanup
To remove all resources and avoid costs:
```bash
terraform destroy
```