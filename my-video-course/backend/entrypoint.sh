#!/bin/bash
# 🚀 Unified Entrypoint for Node.js + DynamoDB

# Wait for network (optional but good practice)
sleep 2

echo "🔄 Syncing data to DynamoDB..."
npm run migrate-dynamodb

echo "🚀 Starting Node.js application..."
exec node src/server.js
