#!/bin/sh
# App container entrypoint: run Prisma migrations (safe, idempotent), then
# start Next. Uses `migrate deploy` — the production-safe command that applies
# pending migrations without generating new ones or prompting. DOES NOT drop
# columns, and refuses to run on drift.
#
# NEVER use `db push --accept-data-loss` here: if a dev accidentally drops a
# field in schema.prisma, the next deploy would silently wipe that column.
set -e

# docker-compose interpolates DB_PASSWORD / REDIS_PASSWORD raw into URLs,
# but `openssl rand -base64` generates passwords containing /, +, = which
# break URL parsers (Prisma raises "invalid port number"). Rebuild the URLs
# with URL-encoded passwords so any charset works. Postgres/Redis stored
# passwords are unchanged — only the URL serialization is fixed.
if [ -n "${DB_PASSWORD:-}" ]; then
  DB_PW_ENC=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' -- "$DB_PASSWORD")
  export DATABASE_URL="postgresql://autoapply:${DB_PW_ENC}@db:5432/autoapply"
fi
if [ -n "${REDIS_PASSWORD:-}" ]; then
  REDIS_PW_ENC=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' -- "$REDIS_PASSWORD")
  export REDIS_URL="redis://:${REDIS_PW_ENC}@redis:6379"
fi

echo "[entrypoint] applying Prisma migrations"
if [ -d "./worker_modules/.bin" ]; then
  ./worker_modules/.bin/prisma migrate deploy
else
  echo "[entrypoint] ERROR: prisma binary missing" >&2
  exit 1
fi

echo "[entrypoint] starting Next.js server on :${PORT:-3002}"
exec node server.js
