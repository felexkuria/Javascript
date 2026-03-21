#!/bin/bash
# 🔐 Cognito Admin User Seeder
# This script creates and confirms the default admin user in your AWS Cognito User Pool.

# Find .env file (try script's directory, then parent, then backend/root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/../.env" ]; then
    export $(grep -v '^#' "$SCRIPT_DIR/../.env" | xargs)
elif [ -f "$SCRIPT_DIR/../../.env" ]; then
    export $(grep -v '^#' "$SCRIPT_DIR/../../.env" | xargs)
elif [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "❌ Error: .env file not found near $SCRIPT_DIR"
    exit 1
fi

EMAIL="engineerfelex@gmail.com"
PASSWORD="test12345"

if [ -z "$COGNITO_USER_POOL_ID" ]; then
    echo "❌ Error: COGNITO_USER_POOL_ID not found in .env"
    exit 1
fi

echo "🚀 Provisioning Admin User in Cognito (Pool: $COGNITO_USER_POOL_ID)..."

# 1. Admin Create User (Suppressing invitation email)
aws cognito-idp admin-create-user \
    --user-pool-id "$COGNITO_USER_POOL_ID" \
    --username "$EMAIL" \
    --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
    --message-action SUPPRESS 2>/dev/null

if [ $? -eq 0 ]; then
    echo "✨ User created successfully."
else
    echo "ℹ️  User might already exist, proceeding to reset password."
fi

# 2. Set Admin Password (Permanently to status 'CONFIRMED')
aws cognito-idp admin-set-user-password \
    --user-pool-id "$COGNITO_USER_POOL_ID" \
    --username "$EMAIL" \
    --password "$PASSWORD" \
    --permanent

if [ $? -eq 0 ]; then
    echo "✅ Admin user $EMAIL is now CONFIRMED with password: $PASSWORD"
    echo "🎯 You can now log into http://localhost:3000/login"
else
    echo "❌ Error: Failed to set user password."
    exit 1
fi
