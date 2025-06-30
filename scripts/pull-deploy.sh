#!/usr/bin/env bash
# Pull a pre-built image from GHCR, roll over with zero-ish downtime, and
# verify health. Invoked by CI over SSH:
#
#   ssh user@vps "cd /opt/autoapply && IMAGE_TAG=sha-abc1234 ./scripts/pull-deploy.sh"
#
# Requires on the VPS:
#   - /opt/autoapply checked out from git
#   - .env.production filled in
#   - docker + docker compose v2
#   - logged in to GHCR: `echo $CR_PAT | docker login ghcr.io -u <user> --password-stdin`

set -euo pipefail

cd "$(dirname "$0")/.."

BOLD=$'\033[1m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; RESET=$'\033[0m'
info()  { echo "${GREEN}${BOLD}▶${RESET} $*"; }
warn()  { echo "${YELLOW}${BOLD}!${RESET} $*"; }
fail()  { echo "${RED}${BOLD}✖${RESET} $*" >&2; exit 1; }

IMAGE_TAG="${IMAGE_TAG:-latest}"
IMAGE="${IMAGE:-ghcr.io/clawb00t13-web/autoapply}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"

[[ -f .env.production ]] || fail ".env.production missing on VPS"

# Load env so DOMAIN, DB_PASSWORD, REDIS_PASSWORD etc. are available to compose
set -a
# shellcheck disable=SC1091
source .env.production
set +a
export IMAGE IMAGE_TAG

COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.registry.yml)

# Record current image tags so we can roll back on failure
PREV_APP=$(docker compose "${COMPOSE_FILES[@]}" config 2>/dev/null | awk '/^    image:/ && !seen {print $2; seen=1}' || true)
info "Previous image: ${PREV_APP:-<none>}"
info "Target image:   $IMAGE:$IMAGE_TAG"

info "Pulling new image"
docker compose "${COMPOSE_FILES[@]}" pull app worker

info "Starting new stack"
docker compose "${COMPOSE_FILES[@]}" up -d --no-build

info "Waiting up to ${HEALTH_TIMEOUT}s for /api/health"
OK=0
DEADLINE=$(( $(date +%s) + HEALTH_TIMEOUT ))
while (( $(date +%s) < DEADLINE )); do
  out=$(docker compose "${COMPOSE_FILES[@]}" exec -T app wget -qO- http://localhost:3002/api/health 2>/dev/null || true)
  if echo "$out" | grep -q '"status":"ok"'; then
    OK=1
    break
  fi
  sleep 3
done

if [[ $OK -eq 1 ]]; then
  info "Healthy ✓ — deploy complete"
  # Prune old images (keep last 3)
  docker image prune -f >/dev/null 2>&1 || true
  exit 0
fi

warn "Health check failed — attempting rollback"
if [[ -n "${PREV_APP:-}" && "$PREV_APP" != "$IMAGE:$IMAGE_TAG" ]]; then
  # Parse "<img>:<tag>" out of PREV_APP for IMAGE_TAG
  PREV_TAG="${PREV_APP##*:}"
  export IMAGE_TAG="$PREV_TAG"
  docker compose "${COMPOSE_FILES[@]}" up -d --no-build
  warn "Rolled back to $PREV_APP"
  exit 1
fi

fail "Deploy failed and no previous image to roll back to. Check: docker compose logs app"
