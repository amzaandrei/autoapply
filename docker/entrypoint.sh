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
#
# We must NOT feed the raw compose-interpolated URL to new URL(): a base64
# password containing '/' makes the string un-parseable and new URL() throws,
# which under `set -e` crashes the container at boot. base64 has no ':' or
# '@', so splitting on the separator ':' and the last '@' isolates the
# password safely; we then re-encode only the password. Keep this in sync
# with docker/worker-entrypoint.sh.
rewrite_url_password() {
  node -e '
    const raw = process.argv[1], pw = process.argv[2];
    const s = raw.indexOf("://"), at = raw.lastIndexOf("@");
    if (s === -1 || at === -1) { process.stdout.write(raw); process.exit(0); }
    const scheme = raw.slice(0, s + 3);
    const userinfo = raw.slice(s + 3, at);
    const hostpath = raw.slice(at + 1);
    const c = userinfo.indexOf(":");
    const user = c === -1 ? userinfo : userinfo.slice(0, c);
    process.stdout.write(scheme + user + ":" + encodeURIComponent(pw) + "@" + hostpath);
  ' -- "$1" "$2"
}

if [ -n "${DB_PASSWORD:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
  export DATABASE_URL=$(rewrite_url_password "$DATABASE_URL" "$DB_PASSWORD")
fi
if [ -n "${REDIS_PASSWORD:-}" ] && [ -n "${REDIS_URL:-}" ]; then
  export REDIS_URL=$(rewrite_url_password "$REDIS_URL" "$REDIS_PASSWORD")
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
