# Operational Runbook

Day-2 operations for the AutoApply production stack. For first-time setup and
the full go-live checklist see [DEPLOY.md](./DEPLOY.md); for secret handling and
CSP see [SECURITY.md](./SECURITY.md). This document assumes the stack is already
running under Docker Compose on the VPS at `/opt/autoapply`.

## Stack at a glance

| Service | Image | Role |
|---|---|---|
| `app` | `autoapply-app` / GHCR image | Next.js web app, exposes `:3002` internally |
| `worker` | same image | BullMQ worker + cron sweep (`WORKER_CRON_ENABLED=true`) |
| `db` | `postgres:17-alpine` | Postgres, reachable in-network as `autoapply-db` |
| `redis` | `redis:7-alpine` | queue + rate-limit store, appendonly, 256mb LRU |
| `caddy` | `caddy:2-alpine` | TLS termination + reverse proxy (ports 80/443) |

All commands below run from `/opt/autoapply` on the VPS unless noted.

---

## Deploy

Deploys are driven by GitHub Actions (`.github/workflows/`), not by hand:

- **dev** — every push to `main` triggers `deploy-dev.yml`.
- **prod** — a pushed `v*` tag or a manual **Actions → Deploy — prod → Run
  workflow** triggers `deploy-prod.yml`.

Both call the reusable `_deploy.yml`, which builds the image with buildx, pushes
it to GHCR (`ghcr.io/clawb00t13-web/autoapply:<tag>` plus `<env>-latest`), then
SSHes into the target VPS and runs [`scripts/pull-deploy.sh`](../scripts/pull-deploy.sh).
That script pulls the new image, brings the stack up with `--no-build`, and
waits up to 120s for `/api/health` to report `"status":"ok"`. CI finishes with a
public smoke test of `https://<PUBLIC_URL>/api/health`.

Manual deploy of a specific tag (e.g. hotfix without CI):

```bash
cd /opt/autoapply
IMAGE_TAG=sha-abc1234 ./scripts/pull-deploy.sh
```

The very first deploy on a fresh box builds locally instead:
`./scripts/prod.sh --detach` (see DEPLOY.md).

## Rollback

`pull-deploy.sh` records the **currently running** container image (via
`docker inspect autoapply-app-1`) before swapping. If the new image fails its
health check within 120s it automatically redeploys the previous GHCR tag. It
only auto-rolls-back to an image from the same GHCR repo — a locally built
`autoapply-app:latest` (first deploy) can't be pulled back, so it bails with a
log message instead of looping.

Manual rollback to a known-good build:

```bash
# Find a good tag on the GHCR package page, or: docker image ls | grep autoapply
IMAGE_TAG=sha-<known-good> ./scripts/pull-deploy.sh
```

Or from CI: **Actions → Deploy — prod → Run workflow**, paste the older tag.
Because a rollback just re-pulls an already-built image, it's fast and does not
rebuild. Note: rollback swaps the **app/worker image only** — it does **not**
revert database migrations. If a bad deploy shipped a destructive migration,
roll back the image *and* restore the DB (see below).

---

## Health checks

`GET /api/health` ([route](../app/api/health/route.ts)) pings Postgres and
Redis and returns JSON:

```json
{ "status": "ok", "db": "up", "redis": "up", "version": "sha-abc1234", "timestamp": "..." }
```

| `status` | HTTP | Meaning | Action |
|---|---|---|---|
| `ok` | 200 | DB up, Redis up (or intentionally `skipped`) | none |
| `degraded` | 200 | DB up but **Redis down** — queues/rate-limits impaired, web still serves | restart redis, check worker |
| `down` | 503 | **Postgres unreachable** — app cannot serve | check `db` service, connections, disk |

Check from the VPS or anywhere:

```bash
curl -s https://<domain>/api/health | jq
# or in-container (no public DNS needed):
docker compose exec -T app wget -qO- http://localhost:3002/api/health
```

`version` echoes the deployed `GIT_SHA` — use it to confirm which build is live.

---

## Logs & observability

```bash
docker compose logs -f app worker      # application logs (structured JSON in prod)
docker compose logs -f caddy           # access logs + TLS/cert issuance
docker compose logs --tail=200 db      # Postgres
docker compose ps                      # service health/status overview
```

- **Sentry** captures unhandled errors, tagged with `userId`. Check the Sentry
  project first when users report failures you can't reproduce.
- **PostHog** captures product events (`signed_up`, `campaign_created`, …) — for
  funnel/behaviour questions, not error triage.

---

## Database backups & restore

**Location:** `/backups/autoapply-YYYY-MM-DD.sql.gz` on the VPS.
**Schedule:** nightly at 02:00 via cron (installed by
[`scripts/bootstrap-vps.sh`](../scripts/bootstrap-vps.sh)):

```
0 2 * * *  ... pg_dump -U autoapply autoapply | gzip > /backups/autoapply-$(date +%F).sql.gz
           && find /backups -name 'autoapply-*.sql.gz' -mtime +7 -delete
```

**Retention:** 7 days (older dumps are pruned by the `find ... -delete` above).

Verify backups exist and are recent:

```bash
ls -lh /backups/autoapply-*.sql.gz | tail -5
```

**Restore** with [`scripts/restore-db.sh`](../scripts/restore-db.sh). It is
DESTRUCTIVE — it drops and recreates the database, then loads the dump — and
prompts for a typed `yes` first:

```bash
cd /opt/autoapply
./scripts/restore-db.sh /backups/autoapply-2026-07-24.sql.gz
# then reconnect the app cleanly:
docker compose up -d --force-recreate app worker
```

Handles both `.sql.gz` and plain `.sql`. It reads `DB_PASSWORD` from
`.env.production` and defaults the service/user/db to `db`/`autoapply`/`autoapply`.

> **Known risk — backups are on-host only.** Dumps live on the same VPS disk as
> the database, with no offsite/object-storage copy. Loss of the host (disk
> failure, provider incident, accidental `--wipe`) loses the backups too.
> Mitigation is a documented follow-up: ship `/backups` to S3/B2 or another host
> on a schedule.

---

## Redis & worker

Redis is `appendonly yes` with `maxmemory 256mb` / `allkeys-lru`, so it survives
restarts but is intentionally evictable (it holds queues + rate-limit counters,
not source-of-truth data — plan quotas live in Postgres `UsageCounter`).

```bash
docker compose restart redis           # bounce Redis (queues re-drain from BullMQ)
docker compose restart worker          # bounce the worker / cron sweep
docker compose logs -f worker          # confirm it reconnected and picked up jobs
```

If `/api/health` reports `degraded`, restart `redis` first, then `worker`. The
cron sweep only runs when `WORKER_CRON_ENABLED=true`; autopilot email-sending is
separately gated by `AUTOPILOT_ENABLED` (see DEPLOY.md §6).

---

## Secret rotation

The rotation table (per-provider console URLs) lives in
[SECURITY.md](./SECURITY.md#before-public-launch--rotate-all-keys). After
changing any value in `.env.production` on the VPS:

```bash
docker compose up -d --force-recreate app worker
```

Caveat: `NEXT_PUBLIC_*` values (Mapbox token, Sentry DSN, PostHog, app URL) are
**baked into the client bundle at build time** via compose build-args — rotating
them requires a **rebuild/redeploy** (push a commit or re-run the deploy
workflow), not just a container recreate.

---

## Incident quick reference

| Symptom | First checks | Likely fix |
|---|---|---|
| `/api/health` → `down` (503) | `docker compose ps`, `docker compose logs db` | DB container down / disk full / wrong `DB_PASSWORD`; restart `db`, free disk |
| `/api/health` → `degraded` | `docker compose logs redis worker` | restart `redis`, then `worker` |
| Site unreachable, no TLS | `docker compose logs caddy` | DNS `A` record wrong or port 80/443 blocked at cloud firewall |
| 5xx after a deploy | `docker compose logs app`, compare `version` in `/api/health` | bad build/env var — roll back to last good `IMAGE_TAG` |
| Deploy rolled itself back | CI logs + `docker compose logs app` on VPS | health failed in 120s — usually missing env var or migration error |
| Data corruption / bad migration | confirm blast radius | roll back image **and** `./scripts/restore-db.sh <last good dump>` |
| Stripe webhook 400s | `docker compose logs app` (filter for `stripe`) | `STRIPE_WEBHOOK_SECRET` ≠ Stripe Dashboard signing secret |
| OAuth `redirect_uri_mismatch` | Google/LinkedIn OAuth config | add `https://<domain>/api/gmail/callback` redirect URI |
| Queues not draining | `docker compose logs worker`, `/api/health` redis | worker crashed or Redis down — restart both |

Escalation order: (1) read `docker compose logs`, (2) check Sentry, (3)
`/api/health` for the failing dependency, (4) roll back the last deploy, (5)
restore the DB only if data is compromised.
