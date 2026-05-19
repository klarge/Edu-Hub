#!/bin/sh
set -e

echo "[entrypoint] Pushing database schema..."
./node_modules/.bin/drizzle-kit push --config lib/db/drizzle.config.ts --force

echo "[entrypoint] Starting API server..."
exec node --enable-source-maps ./dist/index.mjs
