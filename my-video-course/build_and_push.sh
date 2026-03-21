#!/bin/bash
# 🚀 Build and Push script for video-course-app
set -e

# Configuration
AWS_REGION="us-east-1"
REPO_NAME="video-course-app"
ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text)
ECR_URL="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

echo "Logging in to ECR..."
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_URL}

echo "Building Docker image..."
docker build -t ${REPO_NAME} .

echo "Tagging and Pushing image..."
docker tag ${REPO_NAME}:latest ${ECR_URL}/${REPO_NAME}:latest
docker push ${ECR_URL}/${REPO_NAME}:latest

echo "✅ Push complete! Now run 'terraform apply' to refresh your instances."
