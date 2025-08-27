#!/bin/bash

# AWS Deployment Script for Video Course App
set -e

# Configuration
AWS_REGION="us-east-1"
ECR_REPOSITORY="video-course-app"
ECS_CLUSTER="video-course-cluster"
ECS_SERVICE="video-course-service"
TASK_DEFINITION="video-course-app"

# Get AWS Account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "🚀 Starting deployment to AWS..."
echo "Account ID: $AWS_ACCOUNT_ID"
echo "Region: $AWS_REGION"

# 1. Create ECR repository if it doesn't exist
echo "📦 Creating ECR repository..."
aws ecr describe-repositories --repository-names $ECR_REPOSITORY --region $AWS_REGION || \
aws ecr create-repository --repository-name $ECR_REPOSITORY --region $AWS_REGION

# 2. Get ECR login token
echo "🔐 Logging into ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# 3. Detect CPU architecture and build accordingly
CPU_ARCH=$(uname -m)
echo "🔍 Detected CPU architecture: $CPU_ARCH"

if [[ "$CPU_ARCH" == "arm64" ]] || [[ "$CPU_ARCH" == "aarch64" ]]; then
    echo "🍎 ARM64 detected - need cross-platform build for EC2 (x86_64)"
    
    # Check if buildx is available
    if docker buildx version >/dev/null 2>&1; then
        echo "✅ Using docker buildx for cross-platform build"
        export DOCKER_BUILDKIT=1
        docker buildx create --use --name multiarch 2>/dev/null || docker buildx use multiarch
        docker buildx build --platform linux/amd64 \
            -t $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:latest \
            --push .
        echo "✅ Cross-platform image built and pushed directly"
        exit 0
    else
        echo "⚠️  buildx not available - using legacy build (may fail on EC2)"
        echo "   Install Docker Desktop for proper cross-platform support"
        docker build --no-cache -t $ECR_REPOSITORY .
    fi
else
    echo "💻 x86_64 detected - using standard docker build"
    docker build --no-cache -t $ECR_REPOSITORY .
fi

# 4. Tag image for ECR (only for legacy build)
echo "🏷️ Tagging image..."
docker tag $ECR_REPOSITORY:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:latest

# 5. Push image to ECR (only for legacy build)
echo "📤 Pushing image to ECR..."
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:latest

echo "✅ Docker image pushed to ECR successfully!"
echo "🚀 Image: $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:latest"
echo "📋 Next steps:"
echo "   1. Deploy Terraform infrastructure: cd terraform && terraform apply"
echo "   2. EC2 instances will automatically pull this image via user_data.sh"
echo "   3. Access your app at: https://skool.shopmultitouch.com"