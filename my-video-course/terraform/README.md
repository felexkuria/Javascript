# Video Course Platform - Terraform Deployment

## ✅ Completed Setup
- **ECR Repository**: `767397885043.dkr.ecr.us-east-1.amazonaws.com/video-course-app`
- **Docker Image**: Multi-stage build with Whisper integration
- **S3 Streaming**: Videos served directly from S3
- **Cost Optimization**: Whisper (<1hr) + AWS Transcribe (>1hr)

## 🚀 Deployment Steps

### 1. Prerequisites
```bash
# Install required tools
brew install terraform awscli docker colima
# Configure AWS CLI
aws configure
```

### 2. Configure Variables
```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:
```hcl
aws_region = "us-east-1"
app_name   = "video-course-app"

# EC2 Configuration
instance_type    = "t3.medium"
key_pair_name    = "MacbookKey"

# Auto Scaling
min_size         = 1
max_size         = 5
desired_capacity = 2

# Application Configuration
mongodb_uri           = "your-mongodb-connection-string"
aws_access_key_id     = "your-aws-access-key-id"
aws_secret_access_key = "your-aws-secret-access-key"
s3_bucket_name        = "video-course-bucket-001"
gemini_api_key        = "your-gemini-api-key"
nova_api_key          = "your-nova-api-key"

# Domain Configuration
domain_name     = "skool.shopmultitouch.com"
hosted_zone_id  = "Z09997541K6AWN7GYC7SC"
```

### 3. Deploy Infrastructure
```bash
terraform init
terraform plan
terraform apply
```

### 4. Build & Push Docker Image (CRITICAL)
```bash
cd ..
# Build for linux/amd64 platform (fixes ARM64 compatibility)
./aws/deploy.sh
```

**⚠️ Important**: Always build with `--platform linux/amd64` to avoid exec format errors on EC2.

### 5. Upload Videos to S3
```bash
aws s3 sync ./public/videos/ s3://video-course-bucket-001/courses/
```

### 6. Verify Deployment
```bash
# Check target health
aws elbv2 describe-target-health --target-group-arn $(terraform output -raw target_group_arn)

# Check container logs
aws logs tail /aws/ec2/video-course-app --follow
```

### 7. Access Application
- **URL**: https://skool.shopmultitouch.com
- **Health**: https://skool.shopmultitouch.com/health

## 📋 Infrastructure Components

### Core Services
- **VPC**: Custom VPC with public subnets
- **ALB**: Application Load Balancer with SSL
- **ASG**: Auto Scaling Group (1-5 instances)
- **EC2**: t3.medium instances with Docker
- **S3**: Video storage with encryption
- **Cognito**: User authentication
- **Route 53**: DNS management
- **ACM**: SSL certificate

### Security
- **HTTPS Only**: HTTP redirects to HTTPS
- **Security Groups**: Restricted access
- **IAM Roles**: Least privilege access
- **S3 Encryption**: AES256 server-side
- **Cognito Auth**: JWT token-based

## 🔧 Management Commands

### Scale Application
```bash
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name video-course-app-asg \
  --desired-capacity 3
```

### Update Application
```bash
# Build and push new image (with correct platform)
./aws/deploy.sh

# Terminate unhealthy instances (they'll auto-recreate)
aws autoscaling terminate-instance-in-auto-scaling-group \
  --instance-id i-xxxxx \
  --should-decrement-desired-capacity false

# Or refresh all instances
aws autoscaling start-instance-refresh \
  --auto-scaling-group-name video-course-app-asg
```

### Monitor Resources
```bash
# Check instances
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names video-course-app-asg

# Check S3 usage
aws s3 ls s3://video-course-bucket-001 --recursive --summarize
```

## 💰 Cost Optimization

### Monthly Estimates
- **EC2 t3.medium**: ~$30/instance
- **ALB**: ~$20
- **S3 Storage**: ~$0.023/GB
- **Route 53**: ~$0.50
- **Cognito**: Free (50K MAU)

### Savings Features
- **Whisper**: Local transcription for short videos
- **AWS Transcribe**: Only for videos >1 hour
- **S3 Intelligent Tiering**: Automatic cost optimization
- **Auto Scaling**: Pay only for needed capacity

## 🔐 Security Features

### Authentication
- **Cognito User Pool**: Email-based signup
- **JWT Tokens**: Secure API access
- **Password Policy**: Strong requirements
- **Email Verification**: Required activation

### Data Protection
- **S3 Encryption**: All data encrypted at rest
- **HTTPS**: All traffic encrypted in transit
- **IAM Roles**: No hardcoded credentials
- **Security Groups**: Network-level protection

## 📊 Monitoring

### Health Checks
- **ALB**: Monitors `/health` endpoint
- **Auto Scaling**: ELB health check type
- **CloudWatch**: CPU and network metrics

### Scaling Triggers
- **Scale Up**: CPU > 70% for 4 minutes
- **Scale Down**: CPU < 30% for 4 minutes
- **Grace Period**: 5 minutes startup time

## 🗂️ S3 Structure
```
video-course-bucket-001/
├── courses/
│   ├── course-1/
│   │   ├── videos/
│   │   ├── thumbnails/
│   │   └── transcriptions/
│   └── course-2/
└── users/
    └── {user-id}/
        ├── progress/
        └── uploads/
```

## 🔧 Troubleshooting

### 502 Bad Gateway Errors
```bash
# Check target health
aws elbv2 describe-target-health --target-group-arn $(terraform output -raw target_group_arn)

# Check container status
aws ssm start-session --target i-xxxxx
sudo docker ps -a
sudo docker logs video-course-app
```

### Common Issues
- **Exec format error**: Rebuild with `--platform linux/amd64`
- **Container won't start**: Check environment variables in user_data.sh
- **Health check fails**: Ensure app binds to `0.0.0.0:3000`, not `localhost`

## 🧹 Cleanup
```bash
# Backup data
aws s3 sync s3://video-course-bucket-001 ./backup/

# Empty bucket
aws s3 rm s3://video-course-bucket-001 --recursive

# Destroy infrastructure
terraform destroy
```

## 📝 Outputs
After deployment, Terraform provides:
- `load_balancer_url`: Application URL
- `s3_bucket_name`: Video storage bucket
- `cognito_user_pool_id`: Authentication pool
- `cognito_client_id`: App client ID
- `autoscaling_group_name`: ASG for management