#!/bin/bash

# Build for linux/amd64 platform
echo "Building Docker image for linux/amd64..."
docker build --platform linux/amd64 -t 767397885043.dkr.ecr.us-east-1.amazonaws.com/video-course-app:latest .

# Login to ECR
echo "Logging into ECR..."
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 767397885043.dkr.ecr.us-east-1.amazonaws.com

# Push the image
echo "Pushing image to ECR..."
docker push 767397885043.dkr.ecr.us-east-1.amazonaws.com/video-course-app:latest

echo "Build and push completed!"