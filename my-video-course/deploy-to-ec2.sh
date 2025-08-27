#!/bin/bash

# Quick EC2 Deployment Script
set -e

echo "🚀 Starting EC2 deployment..."

# Build Docker image
echo "📦 Building Docker image..."
docker build -t video-course-app .

# Save image to tar file
echo "💾 Saving image..."
docker save video-course-app > video-course-app.tar

# Upload to EC2 (replace with your EC2 details)
echo "📤 Uploading to EC2..."
EC2_HOST="your-ec2-ip"
EC2_USER="ec2-user"
KEY_PATH="~/.ssh/your-key.pem"

scp -i $KEY_PATH video-course-app.tar $EC2_USER@$EC2_HOST:~/
scp -i $KEY_PATH docker-compose.yml $EC2_USER@$EC2_HOST:~/
scp -i $KEY_PATH .env $EC2_USER@$EC2_HOST:~/

# Deploy on EC2
echo "🚀 Deploying on EC2..."
ssh -i $KEY_PATH $EC2_USER@$EC2_HOST << 'EOF'
# Install Docker if not installed
sudo yum update -y
sudo yum install -y docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -a -G docker ec2-user

# Install docker-compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Load and run the app
docker load < video-course-app.tar
docker-compose up -d

echo "✅ App deployed! Access at http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):3000"
EOF

echo "🎉 Deployment complete!"