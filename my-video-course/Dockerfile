FROM node:18-slim

# Install dependencies for MongoDB
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    wget \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install MongoDB 6.0
RUN wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | gpg --dearmor > /usr/share/keyrings/mongodb-server-6.0.gpg \
    && echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-6.0.gpg ] https://repo.mongodb.org/apt/debian bullseye/mongodb-org/6.0 main" | tee /etc/apt/sources.list.d/mongodb-org-6.0.list \
    && apt-get update && apt-get install -y mongodb-org \
    && rm -rf /var/lib/apt/lists/*

# Create data directory for MongoDB
RUN mkdir -p /data/db

WORKDIR /app

# Copy backend package files and install dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --only=production

# Copy application code
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY data/ ./data/
COPY public/ ./public/

# Use standalone entrypoint script
RUN chmod +x /app/backend/entrypoint.sh

# Set working directory to backend for execution
WORKDIR /app/backend

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["./entrypoint.sh"]