#!/bin/sh

echo "[entrypoint] Pushing database schema..."
# Pipe /dev/null so drizzle-kit never waits for interactive input.
# node_modules/.bin/drizzle-kit is available because drizzle-kit is a root devDependency.
if node_modules/.bin/drizzle-kit push --config lib/db/drizzle.config.ts --force < /dev/null; then
  echo "[entrypoint] Schema push succeeded."
else
  echo "[entrypoint] ERROR: Schema push failed (exit $?). The API may be unavailable." >&2
  exit 1
fi

echo "[entrypoint] Starting API server..."
exec node --enable-source-maps ./dist/index.mjs
