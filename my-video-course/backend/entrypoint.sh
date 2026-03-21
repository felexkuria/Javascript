#!/bin/bash
# 🚀 Unified Entrypoint for Node.js + MongoDB

# 1. Start MongoDB in the background
echo "⏳ Preparing MongoDB..."
mkdir -p /data/db /var/log/mongodb
rm -f /data/db/mongod.lock || true
chmod 777 /data/db /var/log/mongodb # Ensure write access for mounted volumes

echo "⏳ Starting MongoDB (forked)..."
# Try starting, if it fails with code 14, try repair once
if ! mongod --bind_ip 127.0.0.1 --fork --logpath /var/log/mongodb.log --dbpath /data/db; then
    echo "⚠️ Start failed, attempting repair..."
    mongod --dbpath /data/db --repair
    mongod --bind_ip 127.0.0.1 --fork --logpath /var/log/mongodb.log --dbpath /data/db
fi

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
