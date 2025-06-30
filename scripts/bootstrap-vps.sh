#!/usr/bin/env bash
# One-shot VPS bootstrap. Run as root on a fresh Ubuntu 24.04 / Debian 12 box:
#
#   curl -fsSL https://raw.githubusercontent.com/clawb00t13-web/autoapply/main/scripts/bootstrap-vps.sh | bash
#
# After this runs, the VPS is ready for GitHub Actions to push deploys to it.
# You still need to:
#   1. Fill /opt/autoapply/.env.production
#   2. Add the deploy SSH public key to /root/.ssh/authorized_keys (or a deploy user)
#   3. Add the GHCR PAT so the VPS can pull private images (see docs/DEPLOY.md)

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/clawb00t13-web/autoapply.git}"
APP_DIR="${APP_DIR:-/opt/autoapply}"

BOLD=$'\033[1m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'
info() { echo "${GREEN}${BOLD}▶${RESET} $*"; }
warn() { echo "${YELLOW}${BOLD}!${RESET} $*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (sudo su, then re-run)" >&2
  exit 1
fi

info "Updating apt"
apt-get update -qq
apt-get install -y -qq ca-certificates curl git ufw

if ! command -v docker >/dev/null 2>&1; then
  info "Installing Docker"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

info "Configuring firewall"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

info "Cloning repo"
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  cd "$APP_DIR" && git pull --ff-only
fi

cd "$APP_DIR"

if [[ ! -f .env.production ]]; then
  info "Seeding .env.production from template"
  cp .env.production.example .env.production
  warn "Fill in real values: $APP_DIR/.env.production"
fi

mkdir -p /backups

info "Installing daily backup cron"
(crontab -l 2>/dev/null | grep -v 'autoapply/backup' || true; \
 echo "0 2 * * * cd $APP_DIR && docker compose exec -T db pg_dump -U autoapply autoapply | gzip > /backups/autoapply-\$(date +\\%F).sql.gz && find /backups -name 'autoapply-*.sql.gz' -mtime +7 -delete") | crontab -

info "Bootstrap complete."
cat <<'EOM'

Next steps:
  1. Edit /opt/autoapply/.env.production — fill every empty value
  2. Authorize GitHub Actions to SSH in:
       cat ~/.ssh/id_ed25519.pub  (on your dev box)
       echo "<paste>" >> /root/.ssh/authorized_keys
  3. Log docker in to GHCR (so it can pull your image):
       echo "<GHCR_PAT>" | docker login ghcr.io -u <github-username> --password-stdin
  4. First manual deploy (from your dev box):
       cd /opt/autoapply && ./scripts/prod.sh --detach
EOM
