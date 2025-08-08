#!/bin/sh
# Worker entrypoint: runs the BullMQ worker + optional cron.
#
# tsc preserves source tree under --outDir, so scripts/worker.ts compiles
# to dist/scripts/worker.js (not dist/worker.js). Keep this path in sync
# with the --outDir argument in the Dockerfile's builder stage.
set -e
export NODE_PATH=./worker_modules
echo "[worker] starting"
exec node dist/scripts/worker.js
