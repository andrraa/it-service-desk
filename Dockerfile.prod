# Multi-stage Dockerfile for Production
# Stage 1: Build frontend & server
FROM oven/bun:1.4.2 AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Build both Vite frontend (dist/web) and Bun server (dist/server)
RUN bun run build

# Stage 2: Production runner
FROM oven/bun:1.4.2-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy necessary files from builder
COPY --from=builder /app/package.json /app/bun.lock ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/src/server/migrate.ts ./src/server/migrate.ts
COPY --from=builder /app/scripts ./scripts

# Create uploads directory with restricted permissions
RUN mkdir -p /app/storage/uploads && chmod 700 /app/storage/uploads

EXPOSE 3000

# Run database migrations on startup, then start server
CMD sh -c "bun run src/server/migrate.ts && bun run start"
