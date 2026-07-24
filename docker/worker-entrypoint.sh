#!/bin/sh
# Worker entrypoint: runs the BullMQ worker + optional cron.
#
# tsc preserves source tree under --outDir, so scripts/worker.ts compiles
# to dist/scripts/worker.js (not dist/worker.js). Keep this path in sync
# with the --outDir argument in the Dockerfile's builder stage.
set -e

# Same URL-encoding fix as docker/entrypoint.sh — openssl-generated passwords
# with /, +, = break URL parsers unless percent-encoded. Preserve the host
# already present in the provided URL (the postgres service is aliased
# 'autoapply-db' to avoid a co-tenant DNS collision) and only overwrite the
# password — never hardcode the host here.
#
# We must NOT feed the raw compose-interpolated URL to new URL(): a base64
# password containing '/' makes the string un-parseable and new URL() throws,
# which under `set -e` crashes the container at boot. base64 has no ':' or
# '@', so splitting on the separator ':' and the last '@' isolates the
# password safely; we then re-encode only the password.
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

export NODE_PATH=./worker_modules
echo "[worker] starting"
exec node dist/scripts/worker.js
