#!/bin/sh
# App container entrypoint: sync schema with `prisma db push` (project uses
# no migrations dir), then start Next.
set -e

echo "[entrypoint] syncing Prisma schema → database"
if [ -d "./worker_modules/.bin" ]; then
  ./worker_modules/.bin/prisma db push --skip-generate --accept-data-loss
else
  echo "[entrypoint] warning: prisma binary missing, skipping db push"
fi

echo "[entrypoint] starting Next.js server on :${PORT:-3002}"
exec node server.js
