/**
 * Centralized env validation. Import this module to fail fast when required
 * env vars are missing, rather than silently running with undefined values.
 *
 * Server-only vars: only import this file from server code (API routes,
 * server components, server-side utilities). The `client` block below is safe
 * in client bundles (only NEXT_PUBLIC_*).
 */
import { z } from 'zod'

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Required — app won't work without these
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  AUTH_SECRET: z.string().min(16, 'AUTH_SECRET must be at least 16 chars'),
  NEXTAUTH_URL: z.string().url().optional(),

  // OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GMAIL_CLIENT_ID: z.string().optional(),
  GMAIL_CLIENT_SECRET: z.string().optional(),
  GMAIL_REDIRECT_URI: z.string().optional(),
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),

  // AI / external APIs
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  RAPIDAPI_KEY: z.string().optional(),
  HUNTER_API_KEY: z.string().optional(),
  MAPBOX_TOKEN: z.string().optional(),

  // Redis (required in production, falls back to in-memory in dev)
  REDIS_URL: z.string().optional(),

  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_SECRET_KEY_TEST: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_WEBHOOK_SECRET_TEST: z.string().optional(),
  STRIPE_PRICE_ID_PRO: z.string().optional(),
  STRIPE_PRICE_ID_PRO_TEST: z.string().optional(),

  // Observability
  SENTRY_DSN: z.string().optional(),
  POSTHOG_HOST: z.string().optional(),

  // Notifications
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),

  // Cost guards
  ANTHROPIC_DAILY_USD_CAP: z.coerce.number().positive().default(50),

  // Worker
  WORKER_CRON_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
})

const clientSchema = z.object({
  NEXT_PUBLIC_MAPBOX_TOKEN: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
})

function formatIssues(issues: z.ZodIssue[]) {
  return issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
}

function parseServer() {
  const res = serverSchema.safeParse(process.env)
  if (!res.success) {
    // eslint-disable-next-line no-console
    console.error('[env] invalid server env vars:\n' + formatIssues(res.error.issues))
    throw new Error('Invalid server env configuration')
  }
  return res.data
}

function parseClient() {
  const res = clientSchema.safeParse({
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  })
  if (!res.success) {
    // eslint-disable-next-line no-console
    console.error('[env] invalid client env vars:\n' + formatIssues(res.error.issues))
    throw new Error('Invalid client env configuration')
  }
  return res.data
}

const isServer = typeof window === 'undefined'

export const env = isServer ? { ...parseServer(), ...parseClient() } : (parseClient() as any)

export const clientEnv = parseClient()

export const isProduction = process.env.NODE_ENV === 'production'
export const isDevelopment = process.env.NODE_ENV !== 'production'
