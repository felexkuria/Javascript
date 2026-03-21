#!/bin/bash
# 🧪 Unified All-in-One Local Tester (for Colima/Docker)

# 1. Start MongoDB Data Directory
# 2. Build the all-in-one image locally (FORCE REBUILD)
echo "🏗️ Building local unified image (No Cache)..."
docker build --no-cache -t video-course-app:local .
docker image prune -f

# 3. Stop and Remove existing container
echo "🛑 Cleaning up old containers..."
docker stop video-course-app-local 2>/dev/null
docker rm video-course-app-local 2>/dev/null
docker container prune -f

# 4. Run the unified container
echo "🚀 Running unified container on http://localhost:3000"
docker run -d \
  --name video-course-app-local \
  -p 3000:3000 \
  --env-file .env \
  -v "$(pwd)/data:/app/data" \
  video-course-app:local

# 5. Tail logs to catch errors
echo "📋 Tailing logs... (Press Ctrl+C to stop trailing)"
docker logs -f video-course-app-local
