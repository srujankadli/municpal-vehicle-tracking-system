# ==============================================================================
# Municipal Solid Waste Monitoring Platform
# Multi-Stage Production Dockerfile
#
# Stage 1: Builder (Compiles TypeScript backend into dist/)
# Stage 2: Runtime (Minimal production image, non-root user 'node')
# ==============================================================================

# --- STAGE 1: Builder ---
FROM node:24-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci

# Copy application source and build configurations
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript backend
RUN npm run build:backend

# Prune development dependencies to keep production footprint minimal
RUN npm prune --omit=dev


# --- STAGE 2: Production Runtime ---
FROM node:24-alpine AS runner

# Set production environment flags
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

WORKDIR /app

# Install wget/curl for container healthcheck if needed (alpine includes wget by default)
# Create necessary non-root application directory structure
RUN mkdir -p /app/data && chown -R node:node /app

# Copy production dependencies and compiled artifacts from builder
COPY --chown=node:node package*.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node src/db/schema.sql ./dist/db/schema.sql

# Non-root user execution (Node official image includes unprivileged 'node' user: UID/GID 1000)
USER node

# Expose configured HTTP service port
EXPOSE 3000

# Container liveness health check targeting the dedicated /healthz probe
# Deliberately checks process liveness without coupling to external database state
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/healthz || exit 1

# Start the compiled production Fastify backend application
CMD [node, dist/index.js]
