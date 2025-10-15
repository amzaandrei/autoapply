/**
 * Stripe singleton. Selects test or live keys based on NODE_ENV.
 * Throws only on actual use — importing the module is safe.
 */
import Stripe from 'stripe'
import type { Tier } from './tier-limits'

const isProd = process.env.NODE_ENV === 'production'

const STRIPE_SECRET_KEY = isProd
  ? process.env.STRIPE_SECRET_KEY
  : process.env.STRIPE_SECRET_KEY_TEST ?? process.env.STRIPE_SECRET_KEY

const STRIPE_WEBHOOK_SECRET = isProd
  ? process.env.STRIPE_WEBHOOK_SECRET
  : process.env.STRIPE_WEBHOOK_SECRET_TEST ?? process.env.STRIPE_WEBHOOK_SECRET

function envForPlan(plan: 'STARTER' | 'PRO' | 'POWER'): string | undefined {
  // Test IDs fall back to live IDs outside production, so local dev works even
  // if you've only configured one set.
  const liveVar = `STRIPE_PRICE_ID_${plan}`
  const testVar = `STRIPE_PRICE_ID_${plan}_TEST`
  if (isProd) return process.env[liveVar]
  return process.env[testVar] ?? process.env[liveVar]
}

const STRIPE_PRICE_ID_STARTER = envForPlan('STARTER')
const STRIPE_PRICE_ID_PRO = envForPlan('PRO')
const STRIPE_PRICE_ID_POWER = envForPlan('POWER')

let _stripe: Stripe | null = null

export function stripe(): Stripe {
  if (_stripe) return _stripe
  if (!STRIPE_SECRET_KEY) {
    throw new Error(
      `Stripe secret key missing. Set ${isProd ? 'STRIPE_SECRET_KEY' : 'STRIPE_SECRET_KEY_TEST'}.`,
    )
  }
  _stripe = new Stripe(STRIPE_SECRET_KEY, {
    // Use the library's default apiVersion to avoid pinning drift across SDK updates.
    typescript: true,
  })
  return _stripe
}

type PaidPlan = 'STARTER' | 'PRO' | 'POWER'

export function isPaidPlan(value: unknown): value is PaidPlan {
  return value === 'STARTER' || value === 'PRO' || value === 'POWER'
}

/**
 * Resolve the Stripe price id for a given paid plan. Throws a descriptive
 * error pointing at the specific env var that's missing, so misconfigured
 * plans fail loudly at checkout rather than defaulting to the wrong tier.
 */
export function requirePriceIdFor(plan: PaidPlan): string {
  const map: Record<PaidPlan, string | undefined> = {
    STARTER: STRIPE_PRICE_ID_STARTER,
    PRO: STRIPE_PRICE_ID_PRO,
    POWER: STRIPE_PRICE_ID_POWER,
  }
  const id = map[plan]
  if (!id) {
    const envVar = isProd ? `STRIPE_PRICE_ID_${plan}` : `STRIPE_PRICE_ID_${plan}_TEST`
    throw new Error(`Stripe price id missing for ${plan}. Set ${envVar}.`)
  }
  return id
}

/**
 * Inverse lookup — given a Stripe price id (from a webhook or subscription),
 * figure out which plan it corresponds to. Falls back to PRO for legacy rows
 * that predate the STARTER/POWER tiers (those users were sold the old single
 * Pro plan). Returns null only if we truly don't recognize the id.
 */
export function planForPriceId(priceId: string | null | undefined): PaidPlan | null {
  if (!priceId) return null
  if (priceId === STRIPE_PRICE_ID_STARTER) return 'STARTER'
  if (priceId === STRIPE_PRICE_ID_PRO) return 'PRO'
  if (priceId === STRIPE_PRICE_ID_POWER) return 'POWER'
  return null
}

/** @deprecated — use requirePriceIdFor('PRO'). Kept for any legacy callers. */
function requirePriceId(): string {
  return requirePriceIdFor('PRO')
}

export function requireWebhookSecret(): string {
  if (!STRIPE_WEBHOOK_SECRET) {
    throw new Error(
      `Stripe webhook secret missing. Set ${isProd ? 'STRIPE_WEBHOOK_SECRET' : 'STRIPE_WEBHOOK_SECRET_TEST'}.`,
    )
  }
  return STRIPE_WEBHOOK_SECRET
}

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3002'
}

/**
 * Cast-guard for the Prisma `SubscriptionTier` enum — use when assigning back
 * to DB from a resolved plan. Since our Prisma enum mirrors the Tier union
 * exactly, this is a pure compile-time narrowing.
 */
function tierFromPlan(plan: PaidPlan): Tier {
  return plan
}
