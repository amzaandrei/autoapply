# Deployment runbook

Self-host on a VPS via Docker Compose (app + worker + Postgres + Redis + Caddy).

## First-time deploy

1. **Provision** a VPS (Hetzner CX22 / DO basic droplet works fine for low traffic). Point `A` record for your domain to the VPS IP.

2. **Install Docker**:
   ```bash
   curl -fsSL https://get.docker.com | sh
   systemctl enable --now docker
   ```

3. **Clone**:
   ```bash
   git clone https://github.com/clawb00t13-web/autoapply.git
   cd autoapply
   ```

4. **Configure env**:
   ```bash
   cp .env.production.example .env.production
   # Edit .env.production — fill every empty field. See docs/SECURITY.md for rotation.
   $EDITOR .env.production
   ```

5. **Deploy**:
   ```bash
   export $(grep -v '^#' .env.production | xargs)
   docker compose up -d --build
   docker compose logs -f app
   ```

6. **Visit `https://yourdomain`** — Caddy will auto-provision Let's Encrypt.

## Updating

```bash
git pull
export $(grep -v '^#' .env.production | xargs)
docker compose up -d --build
```

`prisma db push` runs in the app's entrypoint, so schema changes apply on restart.

## Stripe webhook setup

After first deploy:

```bash
stripe listen --forward-to https://yourdomain/api/stripe/webhook
# or in Stripe Dashboard: Developers → Webhooks → Add endpoint
# URL: https://yourdomain/api/stripe/webhook
# Events: checkout.session.completed, customer.subscription.*, invoice.payment_failed
```

Copy the signing secret into `STRIPE_WEBHOOK_SECRET` in `.env.production` and restart `app`.

## Backups

Daily Postgres dump (cron on host):

```bash
0 2 * * * cd /root/autoapply && docker compose exec -T db pg_dump -U autoapply autoapply | gzip > /backups/autoapply-$(date +\%F).sql.gz
```

Keep 7 days:
```bash
find /backups -name 'autoapply-*.sql.gz' -mtime +7 -delete
```

Restore:
```bash
gunzip -c /backups/autoapply-2026-04-17.sql.gz | docker compose exec -T db psql -U autoapply autoapply
```

## Logs

```bash
docker compose logs -f app worker   # tail both
docker compose logs --tail=200 app  # last 200 lines
```

Structured logs are JSON in production — pipe into `jq` for filtering:
```bash
docker compose logs app | jq 'select(.level >= 40)'   # warnings+
```

## Secret rotation

See `docs/SECURITY.md` for provider URLs. After rotating:

```bash
$EDITOR .env.production
docker compose up -d --force-recreate app worker
```

No downtime beyond container restart (~5s).

## Disaster recovery

- **Lost database**: restore from the most recent `pg_dump` backup.
- **Lost Redis**: no user data, just caches + rate-limit counters + queue jobs. Safe to wipe — volumes will recreate.
- **Lost Caddy volume**: certs will re-issue on first request (Let's Encrypt rate limits apply).
- **Lost image**: `docker compose build --no-cache` rebuilds.

## Scaling up (if needed)

Current setup is a single-VPS deploy that will handle 100+ active users. When you need more:

1. Move Postgres to a managed service (Supabase, Neon, DigitalOcean Managed DB).
2. Move Redis to Upstash.
3. Run multiple `app` replicas (Caddy does L7 load-balancing if you list them as upstreams).
4. The `worker` service stays single-replica to avoid duplicate follow-up sends (or coordinate via BullMQ's `groupLimit`).

## Troubleshooting

- **Caddy won't get a cert**: check `DOMAIN` resolves to the VPS IP; open ports 80/443 in firewall.
- **App returns 503 on /api/health**: check `docker compose logs db redis` — one of them is failing.
- **Stripe webhook 400**: `STRIPE_WEBHOOK_SECRET` mismatch with the endpoint's signing secret.
- **Follow-ups not sending**: `WORKER_CRON_ENABLED=true` set? Check `docker compose logs worker`.
- **OAuth callback mismatch**: update Google/LinkedIn OAuth redirect URIs to the production domain.
