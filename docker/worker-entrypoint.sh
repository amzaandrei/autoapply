#!/bin/sh
# Worker entrypoint: runs the BullMQ worker + optional cron.
set -e
export NODE_PATH=./worker_modules
echo "[worker] starting"
exec node --experimental-specifier-resolution=node dist/worker.js
