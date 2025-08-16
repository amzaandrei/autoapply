#!/bin/sh
# Worker entrypoint: runs the BullMQ worker + optional cron.
#
# tsc preserves source tree under --outDir, so scripts/worker.ts compiles
# to dist/scripts/worker.js (not dist/worker.js). Keep this path in sync
# with the --outDir argument in the Dockerfile's builder stage.
set -e

# Same URL-encoding fix as docker/entrypoint.sh — openssl-generated passwords
# with /, +, = break URL parsers unless percent-encoded.
if [ -n "${DB_PASSWORD:-}" ]; then
  DB_PW_ENC=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' -- "$DB_PASSWORD")
  export DATABASE_URL="postgresql://autoapply:${DB_PW_ENC}@db:5432/autoapply"
fi
if [ -n "${REDIS_PASSWORD:-}" ]; then
  REDIS_PW_ENC=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' -- "$REDIS_PASSWORD")
  export REDIS_URL="redis://:${REDIS_PW_ENC}@redis:6379"
fi

export NODE_PATH=./worker_modules
echo "[worker] starting"
exec node dist/scripts/worker.js
