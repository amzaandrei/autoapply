#!/usr/bin/env bash
# Finish VPS setup after bootstrap-vps.sh has been run. Usage (on the VPS):
#
#   DEPLOY_PUBKEY="ssh-ed25519 AAAA... autoapply-deploy"  \
#   GHCR_USER="clawb00t13-web"                            \
#   GHCR_PAT="ghp_xxxxxxxxxxxx"                           \
#   ./scripts/complete-vps-setup.sh
#
# What it does:
#   1. Appends DEPLOY_PUBKEY to ~/.ssh/authorized_keys (idempotent)
#   2. Logs docker into ghcr.io so `docker pull` works for private images
#   3. Verifies both are wired up correctly

set -euo pipefail

BOLD=$'\033[1m'; GREEN=$'\033[32m'; RED=$'\033[31m'; RESET=$'\033[0m'
info() { echo "${GREEN}${BOLD}▶${RESET} $*"; }
fail() { echo "${RED}${BOLD}✖${RESET} $*" >&2; exit 1; }

[[ -n "${DEPLOY_PUBKEY:-}" ]] || fail "DEPLOY_PUBKEY env var required (the ssh-ed25519 ... line)"
[[ -n "${GHCR_USER:-}" ]]     || fail "GHCR_USER env var required (your GitHub username)"
[[ -n "${GHCR_PAT:-}" ]]      || fail "GHCR_PAT env var required (GitHub PAT with read:packages scope)"

# 1. SSH key
mkdir -p ~/.ssh
chmod 700 ~/.ssh
touch ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

if grep -qxF "$DEPLOY_PUBKEY" ~/.ssh/authorized_keys; then
  info "Deploy key already in authorized_keys"
else
  echo "$DEPLOY_PUBKEY" >> ~/.ssh/authorized_keys
  info "Added deploy key to authorized_keys"
fi

# 2. GHCR login
info "Logging docker into ghcr.io"
echo "$GHCR_PAT" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
info "Docker login verified"

# 3. Smoke check: can we pull the image?
IMAGE="ghcr.io/clawb00t13-web/autoapply"
info "Test-pulling $IMAGE:dev-latest (may not exist yet — that's ok)"
docker pull "$IMAGE:dev-latest" 2>/dev/null && info "Image pull works ✓" || \
  info "Image not published yet — will succeed after first CI deploy"

info "VPS ready. Next: push to main (or manually trigger deploy-dev workflow)."
