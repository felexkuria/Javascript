#!/bin/bash
# 🚀 Unified Entrypoint for Node.js + DynamoDB (Pure Cloud Edition)

# Clean up any potential artifacts
rm -rf /tmp/mongodb-* 2>/dev/null

echo "🔄 Syncing data to DynamoDB..."
# Run the migration script to sync local JSON to Cloud
npm run migrate-dynamodb

echo "🚀 Starting Node.js application..."
# Execute the application
exec node src/server.js
