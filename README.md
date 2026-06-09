# AutoApply

Autonomous job application agent — run AI-powered outreach campaigns that discover companies, generate personalised cold emails, send them via your own Gmail account, and follow up automatically.

## What it does

AutoApply turns job hunting into a managed campaign. You upload your CV, define a target role and region, and the app:

1. **Discovers** companies matching your criteria via Hunter.io + RapidAPI, enriches them with firmographics, and plots them on an interactive map.
2. **Generates** personalised cold emails with Claude (Anthropic), adapting tone per company. Optionally runs A/B tests between two tones.
3. **Sends** the emails through your own Gmail account, threads follow-ups automatically, and tracks opens/replies.
4. **Autopilots** — a background worker can run the full discover → generate → send loop on a schedule (daily, every 2 days, weekly) with per-user approval gates.
5. **Tracks** interview stages per company and shows campaign analytics in a dashboard.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 + shadcn/ui |
| API | tRPC v11 |
| Auth | NextAuth v5 (Google OAuth + credentials) |
| Database | PostgreSQL via Prisma 7 |
| Queue | BullMQ + Redis |
| AI | Anthropic Claude (SDK v0.36) |
| Email | Gmail API (googleapis) |
| Company data | Hunter.io + RapidAPI |
| Maps | Mapbox GL / react-map-gl |
| Payments | Stripe (Starter $9 / Pro $19 / Power $49) |
| Observability | Sentry + PostHog + LangSmith |
| Deployment | Docker + Caddy (HTTPS auto-cert) |

## Features

- **Campaign templates** — save targeting presets (role, industry, region, tone, follow-up cadence) and reuse them across campaigns.
- **Email deliverability** — Hunter.io email verification + DNS fallback before any email is sent.
- **A/B testing** — split-send two tone variants and track which converts better.
- **Autopilot** — cron-driven worker discovers new companies, generates drafts (READY), and optionally auto-sends without human approval. Opt-in per template with consent timestamp.
- **Interview pipeline** — log stages (Applied → Phone Screen → Technical → Offer) per company.
- **Blacklist** — block companies by name/domain so they never appear in future campaigns.
- **Admin dashboard** — `/admin` route restricted to `ADMIN_EMAILS`, shows user + usage data.
- **Subscription tiers** — Free, Starter, Pro, Power with per-action usage counters (emails sent, AI generations, discoveries, follow-ups, Hunter requests).

## Getting started

### Prerequisites

- Node.js 20+
- PostgreSQL
- Redis
- Docker (for the full stack)

### Local development

```bash
# Clone and install
git clone https://github.com/amzaandrei/autoapply
cd autoapply
npm install

# Set up environment
cp .env.production.example .env.local
# fill in DATABASE_URL, REDIS_URL, AUTH_SECRET, ANTHROPIC_API_KEY,
# GOOGLE_CLIENT_ID/SECRET, GMAIL_CLIENT_ID/SECRET, HUNTER_API_KEY,
# NEXT_PUBLIC_MAPBOX_TOKEN, and Stripe keys

# Migrate database
npx prisma migrate dev

# Start development (Next.js + worker together)
npm run dev

# Or run each process separately
npm run dev:next       # Next.js only (port 3002)
npm run dev:worker     # BullMQ worker only
```

### Production (Docker)

```bash
cp .env.production.example .env.production
# fill in all values — the prod script validates required fields on startup

# First launch
npm run prod

# Detached
npm run prod:detach

# Useful shortcuts
npm run prod:logs      # tail Docker logs
npm run prod:rebuild   # force image rebuild before start
npm run prod:down      # stop stack
```

See [`docs/DEPLOY.md`](docs/DEPLOY.md) for the full VPS bootstrap, GitHub Actions CI/CD setup, and rollback instructions.

## Environment variables

Copy `.env.production.example` to `.env.production` (prod) or `.env.local` (dev). Key variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` / `REDIS_PASSWORD` | BullMQ queue backend |
| `AUTH_SECRET` | NextAuth signing secret (`openssl rand -base64 32`) |
| `GOOGLE_CLIENT_ID/SECRET` | Google OAuth (sign-in) |
| `GMAIL_CLIENT_ID/SECRET` | Gmail API (sending) |
| `ANTHROPIC_API_KEY` | Claude email generation |
| `HUNTER_API_KEY` | Company + email discovery |
| `RAPIDAPI_KEY` | Supplemental company data |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Interactive company map |
| `STRIPE_SECRET_KEY` + price IDs | Billing (3 tiers) |
| `STRIPE_WEBHOOK_SECRET` | Stripe event verification |
| `WORKER_CRON_ENABLED` | Enable/disable the BullMQ cron sweep |
| `AUTOPILOT_ENABLED` | Allow templates to auto-send emails |
| `ADMIN_EMAILS` | Comma-separated emails with `/admin` access |
| `ANTHROPIC_DAILY_USD_CAP` | Hard cap on daily AI spend |

Optional: `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY`, `LANGSMITH_API_KEY`, `TELEGRAM_BOT_TOKEN`.

## Database

Prisma migrations live in `prisma/migrations/`. In production the container entrypoint runs `prisma migrate deploy` automatically on start.

```bash
npm run db:migrate    # create a new migration (dev only)
npm run db:studio     # open Prisma Studio
npm run db:seed       # seed initial data
```

Never use `db:push` against a production database — it can silently drop columns.

## CI/CD

Two GitHub Actions environments (`dev` and `prod`):

- **dev** — triggers on every push to `main`, deploys to the dev VPS.
- **prod** — triggers on `v*` tags or manual dispatch, deploys to the prod VPS.

The pipeline builds a Docker image, pushes to GHCR, SSHes the target VPS, runs `pull-deploy.sh`, and health-checks `/api/health`. A failed health check automatically rolls back to the previous image tag.

## Health check

```bash
curl https://<domain>/api/health
# {"status":"ok","db":"up","redis":"up"}
```

## Project structure

```
app/           Next.js App Router pages & API routes
  campaigns/   Campaign management UI
  discover/    Company discovery & map view
  generate/    Email generation flow
  review/      Email review & approval
  send/        Sending queue management
  templates/   Campaign template editor
  billing/     Stripe checkout & subscription
  admin/       Admin dashboard
components/    Shared React components (shadcn/ui base)
server/        tRPC routers
lib/           Shared utilities, AI helpers, Gmail client
prisma/        Schema, migrations, seed
scripts/       Dev/prod shell scripts
docker/        Docker helper files
docs/          Deployment & security docs
```
