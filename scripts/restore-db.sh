#!/bin/sh
# Restore a gzipped (or plain) pg_dump backup into the running Postgres
# container. This is DESTRUCTIVE: it drops and recreates the target database
# before loading the dump, so the current DB is replaced wholesale.
#
# It is the inverse of the nightly backup cron installed by
# scripts/bootstrap-vps.sh, which writes plain-SQL dumps to
# /backups/autoapply-YYYY-MM-DD.sql.gz via:
#
#   docker compose exec -T db pg_dump -U autoapply autoapply | gzip > <file>
#
# Usage:
#   ./scripts/restore-db.sh /backups/autoapply-2026-07-24.sql.gz
#   ./scripts/restore-db.sh ./some-dump.sql        # plain (uncompressed) works too
#
# Env overrides (defaults match docker-compose.yml):
#   DB_SERVICE      compose service name for Postgres   (default: db)
#   POSTGRES_USER   database role                        (default: autoapply)
#   POSTGRES_DB     database name                        (default: autoapply)
# DB_PASSWORD is read from .env.production if present.

set -eu

cd "$(dirname "$0")/.."

# ── Colours (POSIX-safe: no $'...' ANSI-C quoting available in /bin/sh) ─────
ESC=$(printf '\033')
BOLD="${ESC}[1m"; GREEN="${ESC}[32m"; YELLOW="${ESC}[33m"; RED="${ESC}[31m"; RESET="${ESC}[0m"
info() { echo "${GREEN}${BOLD}▶${RESET} $*"; }
warn() { echo "${YELLOW}${BOLD}!${RESET} $*"; }
fail() { echo "${RED}${BOLD}✖${RESET} $*" >&2; exit 1; }

usage() {
  cat <<EOF
Restore a pg_dump backup into the running Postgres container.

Usage:
  $0 <backup-file>

  <backup-file>  Path to a gzipped (.sql.gz) or plain (.sql) pg_dump, e.g.
                 /backups/autoapply-$(date +%F).sql.gz

WARNING: this DROPs and recreates the target database. All current data is
replaced by the backup. You do NOT need to stop the stack first — active
connections are terminated automatically — but redeploy app + worker after.
EOF
}

# ── Args ───────────────────────────────────────────────────────────────────
BACKUP="${1:-}"
if [ -z "$BACKUP" ]; then
  usage
  exit 1
fi
[ -f "$BACKUP" ] || fail "Backup file not found: $BACKUP"

# ── Load DB settings from env (mirror scripts/prod.sh) ─────────────────────
if [ -f .env.production ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.production
  set +a
fi
DB_SERVICE="${DB_SERVICE:-db}"
DB_USER="${POSTGRES_USER:-autoapply}"
DB_NAME="${POSTGRES_DB:-autoapply}"

# ── Choose the right decompressor from the filename ────────────────────────
case "$BACKUP" in
  *.gz) DECOMP="gzip -dc" ;;
  *)    DECOMP="cat" ;;
esac

# ── docker present + Postgres up ───────────────────────────────────────────
command -v docker >/dev/null 2>&1 || fail "docker not installed"
docker compose version >/dev/null 2>&1 || fail "docker compose v2 required"
if [ -z "$(docker compose ps --status running -q "$DB_SERVICE" 2>/dev/null)" ]; then
  fail "Postgres service '$DB_SERVICE' is not running — start it with ./scripts/prod.sh"
fi

# psql invoked inside the container. Postgres' default local (socket) auth is
# `trust`, which is why the backup cron runs pg_dump with no password; we pass
# PGPASSWORD anyway (harmless, and future-proof if the auth method is tightened).
# $1 = database to connect to; remaining args are forwarded to psql.
run_psql() {
  _db="$1"; shift
  docker compose exec -T \
    -e PGPASSWORD="${DB_PASSWORD:-}" \
    "$DB_SERVICE" psql -U "$DB_USER" -d "$_db" -v ON_ERROR_STOP=1 "$@"
}

# ── DANGER confirmation ────────────────────────────────────────────────────
warn "DANGER — DESTRUCTIVE RESTORE"
echo "  Backup file : $BACKUP"
echo "  Target      : database '$DB_NAME' on compose service '$DB_SERVICE'"
echo "  Effect      : DROP DATABASE $DB_NAME; CREATE DATABASE; load the dump."
echo "                Every row currently in '$DB_NAME' is permanently replaced."
echo ""
printf "Type 'yes' to proceed: "
read -r CONFIRM
[ "$CONFIRM" = "yes" ] || fail "Aborted — nothing was changed."

# ── Recreate the database ──────────────────────────────────────────────────
# Connect to the maintenance `postgres` DB (you can't DROP a database you are
# currently connected to). Terminate other backends first so the DROP isn't
# blocked by the app/worker connection pools.
info "Terminating active connections to '$DB_NAME'"
run_psql postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" \
  >/dev/null

info "Dropping and recreating '$DB_NAME'"
run_psql postgres -c "DROP DATABASE IF EXISTS \"$DB_NAME\";"
run_psql postgres -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";"

# ── Load the dump ──────────────────────────────────────────────────────────
# Stream the (decompressed) SQL straight into psql inside the container. Because
# we start from a freshly created empty database, the plain dump applies cleanly
# and idempotently — re-running this script always yields the same end state.
info "Restoring from $BACKUP"
$DECOMP "$BACKUP" | run_psql "$DB_NAME" >/dev/null

info "Restore complete ✓"
warn "Redeploy app + worker so they reconnect cleanly:"
echo "  docker compose up -d --force-recreate app worker"
