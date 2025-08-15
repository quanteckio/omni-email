# Multi-stage build for production
FROM node:18-alpine AS base

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app directory and set ownership
RUN mkdir -p /usr/src/app && chown -R node:node /usr/src/app
WORKDIR /usr/src/app

# Switch to non-root user
USER node

# Copy package files
COPY --chown=node:node package*.json ./

# Install dependencies
FROM base AS dependencies
RUN npm ci --only=production && npm cache clean --force

# Production stage
FROM base AS production

# Copy node_modules from dependencies stage
COPY --from=dependencies --chown=node:node /usr/src/app/node_modules ./node_modules

# Copy application code
COPY --chown=node:node . .

# Set environment to production
ENV NODE_ENV=production

# Expose port (default Express port)
EXPOSE 3000


# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["npm", "start"]
