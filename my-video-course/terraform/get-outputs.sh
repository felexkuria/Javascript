#!/bin/bash

# Script to get Terraform outputs and set environment variables

echo "🔧 Getting Terraform outputs..."

# Get outputs
COGNITO_USER_POOL_ID=$(terraform output -raw cognito_user_pool_id)
COGNITO_CLIENT_ID=$(terraform output -raw cognito_user_pool_client_id)
COGNITO_IDENTITY_POOL_ID=$(terraform output -raw cognito_identity_pool_id)
LOAD_BALANCER_URL=$(terraform output -raw load_balancer_url)
S3_BUCKET_NAME=$(terraform output -raw s3_bucket_name)

echo "📋 Terraform Outputs:"
echo "COGNITO_USER_POOL_ID=$COGNITO_USER_POOL_ID"
echo "COGNITO_CLIENT_ID=$COGNITO_CLIENT_ID"
echo "COGNITO_IDENTITY_POOL_ID=$COGNITO_IDENTITY_POOL_ID"
echo "LOAD_BALANCER_URL=$LOAD_BALANCER_URL"
echo "S3_BUCKET_NAME=$S3_BUCKET_NAME"

echo ""
echo "💾 Add these to your .env file:"
echo "COGNITO_USER_POOL_ID=$COGNITO_USER_POOL_ID"
echo "COGNITO_CLIENT_ID=$COGNITO_CLIENT_ID"
echo "COGNITO_IDENTITY_POOL_ID=$COGNITO_IDENTITY_POOL_ID"

echo ""
echo "🌐 Your app will be available at: $LOAD_BALANCER_URL"