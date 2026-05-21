### Stage 1: build ─────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace manifests first to cache dependency install layer
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json tsconfig.json ./

# Copy all packages needed by the API server
COPY lib/db/                 ./lib/db/
COPY lib/api-zod/            ./lib/api-zod/
COPY artifacts/api-server/   ./artifacts/api-server/

RUN pnpm install --frozen-lockfile --ignore-scripts

# Build the API server bundle
RUN pnpm --filter @workspace/api-server run build

# Produce a clean production deployment with a flat, fully-resolved node_modules.
# This ensures externalized packages (node-cron, nodemailer, pdfkit, etc.) are
# accessible to Node's module resolver — pnpm's virtual store alone is not enough.
RUN pnpm --filter @workspace/api-server deploy --prod /deploy

### Stage 2: production image ───────────────────────────────────────────────────
FROM node:24-alpine AS runner

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Bundled server output
COPY --from=builder /workspace/artifacts/api-server/dist ./dist

# Production node_modules from pnpm deploy — all runtime deps at the top level
COPY --from=builder /deploy/node_modules ./node_modules

# Pre-generated SQL migrations — applied at startup via migrate()
COPY --from=builder /workspace/lib/db/migrations ./migrations

# package.json required for pino worker path resolution
COPY --from=builder /workspace/artifacts/api-server/package.json ./package.json

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 8080

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
