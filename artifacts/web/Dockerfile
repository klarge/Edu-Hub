### Stage 1: build ─────────────────────────────────────────────────────────────
FROM node:24 AS builder

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json tsconfig.json ./

# Copy packages needed by the web app
COPY lib/api-spec/       ./lib/api-spec/
COPY lib/api-zod/        ./lib/api-zod/
COPY lib/api-client-react/ ./lib/api-client-react/
COPY artifacts/web/      ./artifacts/web/

# Install and build
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter @workspace/web run build

### Stage 2: nginx ──────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

COPY --from=builder /workspace/artifacts/web/dist/public /usr/share/nginx/html
COPY artifacts/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
