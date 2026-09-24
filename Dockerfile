# ==========================================
# Stage 1: Build SPlayer Web application
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /build

# Enable corepack and prepare pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package descriptors and lockfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/
COPY server/package.json ./server/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY web/ ./web/
COPY server/ ./server/

# Build backend and client production bundle
RUN pnpm --filter splayer-server build
RUN pnpm --filter splayer-web build

# ==========================================
# Stage 2: Production runtime container
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

# Install ca-certificates and tzdata for secure HTTPS and timezone support
RUN apk add --no-cache ca-certificates tzdata

ENV NODE_ENV=production
ENV PORT=5173
ENV DIST_DIR=/app/dist

# Create directories
RUN mkdir -p /app/dist /app/scripts

# Copy production bundle from builder (includes static plugins in dist/plugins)
COPY --from=builder /build/web/dist /app/dist

# Copy runtime scripts and backend bundle
COPY --from=builder /build/server/dist/handler.mjs /app/scripts/handler.mjs
COPY docker/server.mjs /app/scripts/server.mjs
COPY docker/docker-entrypoint.sh /app/docker-entrypoint.sh

# Ensure executable permissions
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 5173

ENTRYPOINT ["/app/docker-entrypoint.sh"]
