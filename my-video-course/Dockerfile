# --- STAGE 1: Build & Dependencies ---
FROM node:22-alpine AS builder

# Avoid prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Copy backend package files and install dependencies
COPY backend/package*.json ./backend/
RUN cd backend \
    && npm ci \
    && npm prune --production

# Copy application code
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# --- STAGE 2: Optimized Runtime ---
FROM node:22-alpine AS runtime

# Install essential runtime dependencies
# Note: curl is REQUIRED for the Docker HEALTHCHECK (Line 47) 
# and the CI/CD production health check.
RUN apk add --no-cache --upgrade apk-tools \
    && apk upgrade --no-cache \
    && apk add --no-cache \
    curl

WORKDIR /app

# Copy only production dependencies and application code from builder
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/frontend ./frontend

# Set working directory to backend for execution
WORKDIR /app/backend

# Ensure entrypoint is executable
RUN chmod +x entrypoint.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["./entrypoint.sh"]