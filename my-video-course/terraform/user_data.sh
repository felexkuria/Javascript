#!/bin/bash
set -e

yum update -y

# Install Docker
yum install -y docker unzip
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

# Create environment file
cat > .env << EOF
NODE_ENV=production
PORT=3000
AWS_REGION=${aws_region}
S3_BUCKET_NAME=${s3_bucket_name}
GEMINI_API_KEY=${gemini_api_key}
NOVA_API_KEY=${nova_api_key}
COGNITO_USER_POOL_ID=${cognito_user_pool_id}
COGNITO_CLIENT_ID=${cognito_client_id}
MONGODB_URI=${mongodb_uri}
SESSION_SECRET=${session_secret}
ADMIN_KEY=${admin_key}
EOF

# Login to ECR
aws ecr get-login-password --region ${aws_region} | docker login --username AWS --password-stdin ${account_id}.dkr.ecr.${aws_region}.amazonaws.com

# Pull the latest image
docker pull ${account_id}.dkr.ecr.${aws_region}.amazonaws.com/video-course-app:latest

# Run the unified container
docker run -d \
  --name video-course-app \
  -p 3000:3000 \
  --env-file .env \
  --restart unless-stopped \
  ${account_id}.dkr.ecr.${aws_region}.amazonaws.com/video-course-app:latest