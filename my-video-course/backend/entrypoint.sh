#!/bin/bash
# 🚀 Unified Entrypoint for Node.js + DynamoDB (Pure Cloud Edition)

# Clean up any potential artifacts
rm -rf /tmp/mongodb-* 2>/dev/null

# echo "🔄 Syncing data to DynamoDB (Completed)..."
# Migration is now handled out-of-band or via separate jobs.

echo "🚀 Starting Node.js application..."
# Execute the application
exec node src/server.js
