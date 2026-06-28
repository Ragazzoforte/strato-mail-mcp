FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application
COPY server.js .

# Create attachment directory
RUN mkdir -p /app/attachments

# Non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

# Expose for debugging (optional - not used by MCP)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD ps aux | grep "node server.js" | grep -v grep || exit 1

# Run
CMD ["node", "server.js"]
