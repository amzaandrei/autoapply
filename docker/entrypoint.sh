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
if [ -n "${DB_PASSWORD:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
  export DATABASE_URL=$(node -e '
    const u = new URL(process.argv[1]);
    u.password = process.argv[2];
    process.stdout.write(u.toString());
  ' -- "$DATABASE_URL" "$DB_PASSWORD")
fi
if [ -n "${REDIS_PASSWORD:-}" ] && [ -n "${REDIS_URL:-}" ]; then
  export REDIS_URL=$(node -e '
    const u = new URL(process.argv[1]);
    u.password = process.argv[2];
    process.stdout.write(u.toString());
  ' -- "$REDIS_URL" "$REDIS_PASSWORD")
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
