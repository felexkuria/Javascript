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

# Install AWS CLI v2
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
./aws/install

# Create app directory
mkdir -p /opt/video-course-app
cd /opt/video-course-app

# Create environment file
cat > .env << EOF
NODE_ENV=production
PORT=3000
MONGODB_URI=${mongodb_uri}
AWS_ACCESS_KEY_ID=${aws_access_key_id}
AWS_SECRET_ACCESS_KEY=${aws_secret_access_key}
AWS_REGION=${aws_region}
S3_BUCKET_NAME=${s3_bucket_name}
GEMINI_API_KEY=${gemini_api_key}
NOVA_API_KEY=${nova_api_key}
COGNITO_USER_POOL_ID=${cognito_user_pool_id}
COGNITO_CLIENT_ID=${cognito_client_id}

EOF

# Login to ECR
aws ecr get-login-password --region ${aws_region} | docker login --username AWS --password-stdin 767397885043.dkr.ecr.${aws_region}.amazonaws.com

# Pull the working image
docker pull 767397885043.dkr.ecr.${aws_region}.amazonaws.com/video-course-app:945e4decc4b9ac879ea0344f1431b2f74b48d6ac

# Run the container
docker run -d \
  --name video-course-app \
  -p 3000:3000 \
  --env-file .env \
  --restart unless-stopped \
  767397885043.dkr.ecr.${aws_region}.amazonaws.com/video-course-app:945e4decc4b9ac879ea0344f1431b2f74b48d6ac