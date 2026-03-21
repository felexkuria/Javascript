#!/bin/bash
# 🚀 Unified Entrypoint for Node.js + MongoDB

# 1. Start MongoDB in the background
echo "⏳ Starting MongoDB..."
mkdir -p /data/db
mongod --bind_ip 127.0.0.1 --fork --logpath /var/log/mongodb.log --dbpath /data/db

# 2. Wait for MongoDB to be ready
echo "⏳ Waiting for MongoDB to initialize..."
until mongosh --eval "db.adminCommand('ping')" --quiet > /dev/null 2>&1; do
  sleep 2
done
echo "✅ MongoDB is ready!"

# 3. Optional: Run data migration to DynamoDB
# This ensures local JSON/Mongo data is synced to AWS on startup
echo "🔄 Synchronizing local data to DynamoDB..."
node src/scripts/migrate-to-dynamodb.js || echo "⚠️ Migration skipped or failed (check AWS credentials)"

# 4. Start the Node.js application
echo "🚀 Starting Node.js application..."
exec node src/server.js
