/**
 * Stripe singleton. Selects test or live keys based on NODE_ENV.
 * Throws only on actual use — importing the module is safe.
 */
import Stripe from 'stripe'

const isProd = process.env.NODE_ENV === 'production'

export const STRIPE_SECRET_KEY = isProd
  ? process.env.STRIPE_SECRET_KEY
  : process.env.STRIPE_SECRET_KEY_TEST ?? process.env.STRIPE_SECRET_KEY

export const STRIPE_WEBHOOK_SECRET = isProd
  ? process.env.STRIPE_WEBHOOK_SECRET
  : process.env.STRIPE_WEBHOOK_SECRET_TEST ?? process.env.STRIPE_WEBHOOK_SECRET

export const STRIPE_PRICE_ID_PRO = isProd
  ? process.env.STRIPE_PRICE_ID_PRO
  : process.env.STRIPE_PRICE_ID_PRO_TEST ?? process.env.STRIPE_PRICE_ID_PRO

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

export function requirePriceId(): string {
  if (!STRIPE_PRICE_ID_PRO) {
    throw new Error(
      `Stripe price id missing. Set ${isProd ? 'STRIPE_PRICE_ID_PRO' : 'STRIPE_PRICE_ID_PRO_TEST'}.`,
    )
  }
  return STRIPE_PRICE_ID_PRO
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
