#!/bin/bash
set -e

yum update -y

# Install Docker, AWS CLI, and jq for secret parsing
yum install -y docker unzip jq
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user

# Wait for Docker to be ready
sleep 10
while ! docker info >/dev/null 2>&1; do
  echo "Waiting for Docker to start..."
  sleep 5
done

# Create app directory
mkdir -p /opt/video-course-app
cd /opt/video-course-app

# Pull environment variables from AWS Secrets Manager (Day 11/12 Security improvement)
echo "📥 Fetching application secrets from Secrets Manager..."
aws secretsmanager get-secret-value --region ${aws_region} --secret-id video-course-app-secrets --query SecretString --output text | jq -r 'to_entries|map("\(.key)=\(.value)")|.[]' > .env

# Inject Terraform managed variables that are NOT secrets
cat >> .env << EOF
NODE_ENV=production
PORT=3000
AWS_REGION=${aws_region}
S3_BUCKET_NAME=${s3_bucket_name}
IMAGE_TAG=${image_tag}
EOF

# Login to ECR
aws ecr get-login-password --region ${aws_region} | docker login --username AWS --password-stdin ${account_id}.dkr.ecr.${aws_region}.amazonaws.com

# Pull the latest image
docker pull ${account_id}.dkr.ecr.${aws_region}.amazonaws.com/video-course-app:${image_tag}

# Run the unified container
docker run -d \
  --name video-course-app \
  -p 3000:3000 \
  --env-file .env \
  --restart unless-stopped \
  ${account_id}.dkr.ecr.${aws_region}.amazonaws.com/video-course-app:${image_tag}