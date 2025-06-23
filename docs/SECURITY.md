# Security

## Secret management

**All application secrets live in `.env.local` (dev) or `.env.production` (prod).** Both are in `.gitignore` — do not commit them. The committed template is `.env.production.example`.

### Before public launch — rotate ALL keys

Any key that was ever stored in `.env.local` on a developer machine must be considered compromised and rotated before a public deployment. Rotate at the provider console:

| Secret | Rotation URL |
|---|---|
| `AUTH_SECRET` | Regenerate: `openssl rand -base64 32` |
| `GOOGLE_CLIENT_SECRET` / `GMAIL_CLIENT_SECRET` | Google Cloud Console → APIs & Services → Credentials |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn Developer Portal → Auth keys |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys |
| `RAPIDAPI_KEY` | https://rapidapi.com/developer/dashboard |
| `HUNTER_API_KEY` | https://hunter.io/api_keys |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | https://account.mapbox.com/access-tokens |
| `TELEGRAM_BOT_TOKEN` | Send `/revoke` to @BotFather, then recreate |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → endpoint → Signing secret |

After rotating, update the secret in `.env.production` on the VPS and restart:

```bash
docker compose up -d --force-recreate app worker
```

## Stripe webhook verification

`/api/stripe/webhook` verifies the `stripe-signature` header against `STRIPE_WEBHOOK_SECRET` and rejects forged requests. We also store every event id in the `StripeEvent` table and skip duplicates — this makes the endpoint idempotent, so Stripe's retry policy is safe.

## CSP & HTTP headers

- Per-request strict CSP with nonce → emitted by `middleware.ts`
- HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy → emitted by Caddy (see `Caddyfile`)

Never relax CSP to `unsafe-inline` / `unsafe-eval` for scripts. Use the per-request nonce instead.

## XSS protection

All email HTML rendered to users goes through `lib/sanitize-html.ts` (DOMPurify). Plain-text emails are escaped before being wrapped in `<p>` tags. The `toHtml` helpers in [lib/gmail.ts](../lib/gmail.ts) and [app/review/page.tsx](../app/review/page.tsx) both escape input.

## Rate limiting & cost caps

- Per-user rate limits (hourly discovery, hourly generation) — enforced in Redis (falls back to in-memory in dev).
- Plan quotas (monthly emails, monthly AI generations, campaign count) — persisted in `UsageCounter` so they survive restarts.
- Global Anthropic cost circuit breaker — `ANTHROPIC_DAILY_USD_CAP` (default $50). Refuses further AI calls once the cap is hit, until the next UTC day.

## User authorization

- All tRPC procedures use `protectedProcedure` and scope by `ctx.session.user.id`.
- Mutations on `Company`, `GeneratedEmail`, etc., verify the parent `Campaign` belongs to the requesting user.

## Reporting a vulnerability

Email security@yourdomain (replace before launch) with a description, reproduction steps, and your preferred disclosure timeline.
