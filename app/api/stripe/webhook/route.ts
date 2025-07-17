import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe, requireWebhookSecret, planForPriceId } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { track } from '@/lib/analytics'
import * as Sentry from '@sentry/nextjs'
import type { Tier } from '@/lib/tier-limits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function mapStatus(s: Stripe.Subscription.Status):
  | 'ACTIVE'
  | 'TRIALING'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'INCOMPLETE' {
  switch (s) {
    case 'active':
      return 'ACTIVE'
    case 'trialing':
      return 'TRIALING'
    case 'past_due':
      return 'PAST_DUE'
    case 'canceled':
    case 'unpaid':
      return 'CANCELED'
    default:
      return 'INCOMPLETE'
  }
}

async function findUserIdForCustomer(customerId: string): Promise<string | null> {
  const sub = await prisma.subscription.findUnique({
    where: { stripeCustomerId: customerId },
    select: { userId: true },
  })
  if (sub) return sub.userId
  // Fallback: look up customer metadata
  try {
    const customer = await stripe().customers.retrieve(customerId)
    if (!customer.deleted && typeof customer !== 'string') {
      const uid = customer.metadata?.userId
      if (uid) return uid
    }
  } catch {
    // ignore
  }
  return null
}

async function applySubscriptionUpdate(s: Stripe.Subscription): Promise<void> {
  const userId = await findUserIdForCustomer(s.customer as string)
  if (!userId) {
    logger.warn({ customer: s.customer }, 'webhook: no user for customer')
    return
  }
  const priceId = s.items.data[0]?.price?.id
  const active = s.status === 'active' || s.status === 'trialing'
  // Map the Stripe price id to our tier. Unknown price → fall back to PRO for
  // backwards-compatibility with subscriptions created before STARTER/POWER existed.
  const resolvedPlan = planForPriceId(priceId)
  const tier: Tier = active ? (resolvedPlan ?? 'PRO') : 'FREE'

  // Stripe's ts types report current_period_* on subscription.items, but the
  // classic top-level fields are still populated for single-item subs.
  const sAny = s as unknown as {
    current_period_start?: number | null
    current_period_end?: number | null
  }

  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      tier,
      status: mapStatus(s.status),
      stripeCustomerId: s.customer as string,
      stripeSubscriptionId: s.id,
      stripePriceId: priceId,
      currentPeriodStart: sAny.current_period_start ? new Date(sAny.current_period_start * 1000) : null,
      currentPeriodEnd: sAny.current_period_end ? new Date(sAny.current_period_end * 1000) : null,
      cancelAtPeriodEnd: s.cancel_at_period_end,
    },
    update: {
      tier,
      status: mapStatus(s.status),
      stripeSubscriptionId: s.id,
      stripePriceId: priceId,
      currentPeriodStart: sAny.current_period_start ? new Date(sAny.current_period_start * 1000) : null,
      currentPeriodEnd: sAny.current_period_end ? new Date(sAny.current_period_end * 1000) : null,
      cancelAtPeriodEnd: s.cancel_at_period_end,
    },
  })

  if (tier === 'FREE') track(userId, 'downgraded_to_free')
  else track(userId, 'upgraded_to_paid', { plan: tier, priceId })
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  const body = await req.text()
  let event: Stripe.Event
  try {
    event = stripe().webhooks.constructEvent(body, sig, requireWebhookSecret())
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'webhook signature verify failed')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Idempotency
  const existing = await prisma.stripeEvent.findUnique({ where: { id: event.id } })
  if (existing) return NextResponse.json({ received: true, duplicate: true })

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session
        if (s.subscription) {
          const full = await stripe().subscriptions.retrieve(s.subscription as string)
          await applySubscriptionUpdate(full)
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const s = event.data.object as Stripe.Subscription
        await applySubscriptionUpdate(s)
        break
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice
        const custId = inv.customer as string
        const userId = await findUserIdForCustomer(custId)
        if (userId) {
          await prisma.subscription.update({
            where: { userId },
            data: { status: 'PAST_DUE' },
          })
        }
        break
      }
      default:
        break
    }

    await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } })
    return NextResponse.json({ received: true })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'stripe-webhook', eventType: event.type } })
    logger.error({ err, eventType: event.type }, 'webhook handler error')
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }
}
