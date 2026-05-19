### Stage 1: build ─────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /workspace

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace manifests first to cache dependency install layer
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json tsconfig.json ./

# Copy all packages needed by the API server
COPY lib/db/                 ./lib/db/
COPY lib/api-zod/            ./lib/api-zod/
COPY artifacts/api-server/   ./artifacts/api-server/

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile --ignore-scripts

# Build the API server bundle
RUN pnpm --filter @workspace/api-server run build

### Stage 2: production image ───────────────────────────────────────────────────
FROM node:24-alpine AS runner

WORKDIR /app

# Create a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy the bundled output
COPY --from=builder /workspace/artifacts/api-server/dist ./dist

# Copy externalized runtime dependencies from the workspace node_modules
# (nodemailer, pdfkit, node-cron, pino transports, drizzle-kit, etc.)
COPY --from=builder /workspace/node_modules ./node_modules

# Copy the db schema so drizzle-kit push can run on startup
COPY --from=builder /workspace/lib/db ./lib/db

# Pino needs its worker files relative to the binary path
COPY --from=builder /workspace/artifacts/api-server/package.json ./package.json

# Startup entrypoint: pushes schema then starts the server
COPY artifacts/api-server/entrypoint.sh ./entrypoint.sh

RUN chmod +x ./entrypoint.sh && chown -R appuser:appgroup /app

USER appuser

EXPOSE 8080

CMD ["./entrypoint.sh"]
