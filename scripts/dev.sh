#!/usr/bin/env bash
# Start AutoApply in local development mode.
#
# What this does:
#   1. Verifies .env.local exists (fails early if not)
#   2. Ensures Postgres is running (uses a local docker container if not)
#   3. Optionally starts Redis in docker (needed for follow-ups worker + Redis rate limits)
#   4. Runs prisma db push + prisma generate
#   5. Starts Next.js dev server on port 3002
#   6. Optionally starts the BullMQ worker in the background (if --worker passed)
#
# Usage:
#   ./scripts/dev.sh                # app only
#   ./scripts/dev.sh --worker       # app + background worker
#   ./scripts/dev.sh --fresh        # wipe .next cache before start
#
# Stop: Ctrl-C. Auxiliary containers are left running (db/redis persist state).

set -euo pipefail

cd "$(dirname "$0")/.."

BOLD=$'\033[1m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; RESET=$'\033[0m'
info()  { echo "${GREEN}${BOLD}▶${RESET} $*"; }
warn()  { echo "${YELLOW}${BOLD}!${RESET} $*"; }
fail()  { echo "${RED}${BOLD}✖${RESET} $*" >&2; exit 1; }

# ── Flags ─────────────────────────────────────────────────────────────────
RUN_WORKER=0
FRESH=0
for arg in "$@"; do
  case "$arg" in
    --worker) RUN_WORKER=1 ;;
    --fresh)  FRESH=1 ;;
    -h|--help)
      head -n 18 "$0" | tail -n 17
      exit 0
      ;;
    *) fail "Unknown flag: $arg" ;;
  esac
done

# ── .env.local ─────────────────────────────────────────────────────────────
if [[ ! -f .env.local ]]; then
  fail ".env.local not found. Create it first (see docs/SECURITY.md for required keys)."
fi

# ── Fresh ──────────────────────────────────────────────────────────────────
if [[ $FRESH -eq 1 ]]; then
  info "Clearing .next cache"
  rm -rf .next || warn "couldn't fully clear .next (dev server still running?)"
fi

# ── Postgres ───────────────────────────────────────────────────────────────
if ! pg_isready -h localhost -p 5432 -q 2>/dev/null; then
  warn "Postgres not reachable on localhost:5432 — trying docker container 'autoapply-dev-db'"
  if ! docker ps --format '{{.Names}}' | grep -q '^autoapply-dev-db$'; then
    if docker ps -a --format '{{.Names}}' | grep -q '^autoapply-dev-db$'; then
      docker start autoapply-dev-db >/dev/null
    else
      info "Starting Postgres container"
      docker run -d --name autoapply-dev-db \
        -e POSTGRES_USER=claw \
        -e POSTGRES_PASSWORD=dev \
        -e POSTGRES_DB=autoapply \
        -p 5432:5432 \
        -v autoapply-dev-pgdata:/var/lib/postgresql/data \
        postgres:17-alpine >/dev/null
    fi
    info "Waiting for Postgres to accept connections"
    for _ in $(seq 1 30); do
      pg_isready -h localhost -p 5432 -q && break
      sleep 1
    done
  fi
fi
info "Postgres ready"

# ── Redis (optional but recommended if worker) ─────────────────────────────
if [[ $RUN_WORKER -eq 1 ]]; then
  if ! docker ps --format '{{.Names}}' | grep -q '^autoapply-dev-redis$'; then
    if docker ps -a --format '{{.Names}}' | grep -q '^autoapply-dev-redis$'; then
      docker start autoapply-dev-redis >/dev/null
    else
      info "Starting Redis container"
      docker run -d --name autoapply-dev-redis -p 6379:6379 redis:7-alpine >/dev/null
    fi
  fi
  if ! grep -q '^REDIS_URL=' .env.local; then
    warn "REDIS_URL not in .env.local — appending redis://localhost:6379"
    echo "REDIS_URL=redis://localhost:6379" >> .env.local
  fi
  info "Redis ready"
fi

# ── Prisma ─────────────────────────────────────────────────────────────────
info "Syncing Prisma schema"
pnpm exec prisma generate >/dev/null

# ── Start worker (background, if requested) ────────────────────────────────
WORKER_PID=""
if [[ $RUN_WORKER -eq 1 ]]; then
  info "Building worker"
  pnpm exec tsc --skipLibCheck --module commonjs --target es2020 \
    --moduleResolution node --esModuleInterop --outDir dist scripts/worker.ts >/dev/null

  info "Starting worker in background"
  WORKER_CRON_ENABLED=true node dist/worker.js &
  WORKER_PID=$!
  trap 'info "Stopping worker (pid=$WORKER_PID)"; kill $WORKER_PID 2>/dev/null || true' EXIT INT TERM
fi

# ── Start Next dev server (foreground) ─────────────────────────────────────
info "Starting Next.js dev server on http://localhost:3002"
exec pnpm exec next dev --turbopack --port 3002
