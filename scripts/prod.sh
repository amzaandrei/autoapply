#!/usr/bin/env bash
# Start AutoApply in production mode via Docker Compose.
#
# What this does:
#   1. Verifies .env.production exists and has no empty REQUIRED values
#   2. Exports .env.production into the current shell (needed for compose build args)
#   3. Builds and brings up: app + worker + db + redis + caddy
#   4. Waits for /api/health to report ok
#   5. Tails logs (unless --detach)
#
# Usage:
#   ./scripts/prod.sh               # build + up + tail logs
#   ./scripts/prod.sh --detach      # build + up, don't tail
#   ./scripts/prod.sh --rebuild     # force --no-cache rebuild
#   ./scripts/prod.sh --down        # stop everything (keeps volumes)
#   ./scripts/prod.sh --wipe        # stop + delete db/redis volumes (DATA LOSS)
#   ./scripts/prod.sh --logs        # just tail logs

set -euo pipefail

cd "$(dirname "$0")/.."

BOLD=$'\033[1m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; RESET=$'\033[0m'
info()  { echo "${GREEN}${BOLD}▶${RESET} $*"; }
warn()  { echo "${YELLOW}${BOLD}!${RESET} $*"; }
fail()  { echo "${RED}${BOLD}✖${RESET} $*" >&2; exit 1; }

DETACH=0
REBUILD=0
MODE="up"
for arg in "$@"; do
  case "$arg" in
    --detach|-d) DETACH=1 ;;
    --rebuild)   REBUILD=1 ;;
    --down)      MODE="down" ;;
    --wipe)      MODE="wipe" ;;
    --logs)      MODE="logs" ;;
    -h|--help)
      head -n 18 "$0" | tail -n 17
      exit 0
      ;;
    *) fail "Unknown flag: $arg" ;;
  esac
done

# ── docker present ─────────────────────────────────────────────────────────
command -v docker >/dev/null || fail "docker not installed"
docker compose version >/dev/null 2>&1 || fail "docker compose v2 required"

# ── Pure-action modes (no env needed) ──────────────────────────────────────
if [[ $MODE == "down" ]]; then
  info "Stopping stack (volumes preserved)"
  docker compose down
  exit 0
fi

if [[ $MODE == "wipe" ]]; then
  warn "This will DELETE the database and all Redis data."
  read -r -p "Type 'yes' to confirm: " confirm
  [[ "$confirm" == "yes" ]] || fail "aborted"
  docker compose down -v
  info "Stack wiped"
  exit 0
fi

if [[ $MODE == "logs" ]]; then
  exec docker compose logs -f app worker
fi

# ── .env.production required ───────────────────────────────────────────────
[[ -f .env.production ]] || fail ".env.production not found. Run: cp .env.production.example .env.production"

REQUIRED=(
  DOMAIN NEXT_PUBLIC_APP_URL NEXTAUTH_URL
  AUTH_SECRET DB_PASSWORD REDIS_PASSWORD
  ANTHROPIC_API_KEY
)

MISSING=()
for var in "${REQUIRED[@]}"; do
  val=$(grep -E "^${var}=" .env.production | sed 's/^[^=]*=//' | tr -d '"' | tr -d "'" || true)
  if [[ -z "${val:-}" ]]; then
    MISSING+=("$var")
  fi
done

if (( ${#MISSING[@]} > 0 )); then
  fail "Missing required values in .env.production: ${MISSING[*]}"
fi

# ── Export env for compose build args ──────────────────────────────────────
set -a
# shellcheck disable=SC1091
source .env.production
set +a
export GIT_SHA="${GIT_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo dev)}"

info "Building images (GIT_SHA=$GIT_SHA)"
BUILD_FLAGS=()
[[ $REBUILD -eq 1 ]] && BUILD_FLAGS+=(--no-cache)
docker compose build "${BUILD_FLAGS[@]}"

info "Bringing up stack"
docker compose up -d

# ── Wait for health ────────────────────────────────────────────────────────
info "Waiting for app health (up to 90s)"
OK=0
for i in $(seq 1 30); do
  status=$(docker compose exec -T app wget -qO- http://localhost:3002/api/health 2>/dev/null || true)
  if echo "$status" | grep -q '"status":"ok"'; then
    OK=1
    break
  fi
  sleep 3
done

if [[ $OK -eq 1 ]]; then
  info "App healthy ✓"
else
  warn "Health check didn't succeed in 90s — check logs: docker compose logs app"
fi

info "Stack running:"
docker compose ps

if [[ $DETACH -eq 1 ]]; then
  info "Detached. Tail logs with: ./scripts/prod.sh --logs"
  exit 0
fi

info "Tailing logs (Ctrl-C to stop tailing — stack keeps running)"
exec docker compose logs -f app worker
