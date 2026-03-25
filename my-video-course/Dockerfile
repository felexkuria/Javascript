# Use Ubuntu 22.04 for stable OS support (Pure Cloud Architecture)
FROM ubuntu:22.04

# Avoid prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies and Node.js 22.x (Active LTS)
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    unzip \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs

# Install AWS CLI (Multi-arch support: aarch64 for Silicon Mac, x86_64 for Cloud)
RUN arch=$(uname -m) && \
    if [ "$arch" = "aarch64" ] || [ "$arch" = "arm64" ]; then \
        binary="aarch64"; \
    else \
        binary="x86_64"; \
    fi && \
    curl "https://awscli.amazonaws.com/awscli-exe-linux-${binary}.zip" -o "awscliv2.zip" \
    && unzip awscliv2.zip \
    && ./aws/install \
    && rm -rf awscliv2.zip aws \
    && rm -rf /var/lib/apt/lists/*

# Verify installation
RUN node -v && aws --version

WORKDIR /app

# Copy backend package files and install dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --only=production

# Copy application code
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Use standalone entrypoint script
RUN chmod +x /app/backend/entrypoint.sh

# Set working directory to backend for execution
WORKDIR /app/backend

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["./entrypoint.sh"]