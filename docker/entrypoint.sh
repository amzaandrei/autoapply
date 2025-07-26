#!/bin/sh
# App container entrypoint: run Prisma migrations (safe, idempotent), then
# start Next. Uses `migrate deploy` — the production-safe command that applies
# pending migrations without generating new ones or prompting. DOES NOT drop
# columns, and refuses to run on drift.
#
# NEVER use `db push --accept-data-loss` here: if a dev accidentally drops a
# field in schema.prisma, the next deploy would silently wipe that column.
set -e

echo "[entrypoint] applying Prisma migrations"
if [ -d "./worker_modules/.bin" ]; then
  ./worker_modules/.bin/prisma migrate deploy
else
  echo "[entrypoint] ERROR: prisma binary missing" >&2
  exit 1
fi

echo "[entrypoint] starting Next.js server on :${PORT:-3002}"
exec node server.js
