# AWS Deployment Guide

## Prerequisites

1. **AWS CLI** installed and configured
2. **Docker** installed
3. **AWS Account** with appropriate permissions

## Quick Deployment Steps

### 1. Deploy Infrastructure
```bash
# Deploy CloudFormation stack
aws cloudformation create-stack \
  --stack-name video-course-infrastructure \
  --template-body file://aws/infrastructure.yml \
  --capabilities CAPABILITY_IAM \
  --region us-east-1
```

### 2. Create Secrets in AWS Secrets Manager
```bash
# MongoDB URI
aws secretsmanager create-secret \
  --name "video-course/mongodb-uri" \
  --secret-string "your-mongodb-connection-string" \
  --region us-east-1

# AWS Access Key ID
aws secretsmanager create-secret \
  --name "video-course/aws-access-key-id" \
  --secret-string "your-aws-access-key-id" \
  --region us-east-1

# AWS Secret Access Key
aws secretsmanager create-secret \
  --name "video-course/aws-secret-access-key" \
  --secret-string "your-aws-secret-access-key" \
  --region us-east-1

# S3 Bucket Name
aws secretsmanager create-secret \
  --name "video-course/s3-bucket-name" \
  --secret-string "video-course-bucket-001" \
  --region us-east-1

# Gemini API Key
aws secretsmanager create-secret \
  --name "video-course/gemini-api-key" \
  --secret-string "your-gemini-api-key" \
  --region us-east-1
```

### 3. Deploy Application
```bash
# Run deployment script
./aws/deploy.sh
```

### 4. Create ECS Service
```bash
# Get cluster and target group ARNs from CloudFormation outputs
CLUSTER_NAME=$(aws cloudformation describe-stacks --stack-name video-course-infrastructure --query 'Stacks[0].Outputs[?OutputKey==`ClusterName`].OutputValue' --output text)
TARGET_GROUP_ARN=$(aws elbv2 describe-target-groups --names video-course-app-tg --query 'TargetGroups[0].TargetGroupArn' --output text)

# Create ECS service
aws ecs create-service \
  --cluster $CLUSTER_NAME \
  --service-name video-course-service \
  --task-definition video-course-app \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx,subnet-yyy],securityGroups=[sg-xxx],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=$TARGET_GROUP_ARN,containerName=video-course-container,containerPort=3000" \
  --region us-east-1
```

## Local Testing with Docker

```bash
# Build image
docker build -t video-course-app .

# Run with docker-compose
docker-compose up -d

# View logs
docker-compose logs -f
```

## Environment Variables

Required environment variables:
- `MONGODB_URI` - MongoDB connection string
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
- `AWS_REGION` - AWS region (us-east-1)
- `S3_BUCKET_NAME` - S3 bucket name
- `GEMINI_API_KEY` - Gemini API key

## Monitoring

- **CloudWatch Logs**: `/ecs/video-course-app`
- **Health Check**: `http://your-alb-url/health`
- **Application**: `http://your-alb-url`

## Scaling

```bash
# Scale service
aws ecs update-service \
  --cluster video-course-cluster \
  --service video-course-service \
  --desired-count 3
```

## Troubleshooting

1. **Check ECS service status**:
   ```bash
   aws ecs describe-services --cluster video-course-cluster --services video-course-service
   ```

2. **View logs**:
   ```bash
   aws logs tail /ecs/video-course-app --follow
   ```

3. **Check task health**:
   ```bash
   aws ecs describe-tasks --cluster video-course-cluster --tasks TASK_ARN
   ```