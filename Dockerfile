FROM node:20-alpine

WORKDIR /app

# Install dependencies with npm install (more flexible than ci)
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy application
COPY server.js .

# Create attachment directory
RUN mkdir -p /app/attachments && chmod 755 /app/attachments

# Non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose for debugging (optional - not used by MCP)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD test -f /app/server.js || exit 1

# Run
CMD ["node", "server.js"]
