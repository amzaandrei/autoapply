import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Pull the user's latest subscription from Stripe and sync it to the DB.
 * Used by the billing page after a successful checkout redirect — avoids
 * depending on the webhook race (works even if `stripe listen` isn't running).
 */
export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const local = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
    select: { stripeCustomerId: true, tier: true, status: true },
  })

  if (!local?.stripeCustomerId) {
    return NextResponse.json({ tier: local?.tier ?? 'FREE', synced: false })
  }

  try {
    // Get the most recent subscription for this customer
    const subs = await stripe().subscriptions.list({
      customer: local.stripeCustomerId,
      status: 'all',
      limit: 1,
    })
    const sub = subs.data[0]

    if (!sub) {
      return NextResponse.json({ tier: local.tier, synced: false })
    }

    const mapStatus = (s: string) => {
      switch (s) {
        case 'active':
          return 'ACTIVE' as const
        case 'trialing':
          return 'TRIALING' as const
        case 'past_due':
          return 'PAST_DUE' as const
        case 'canceled':
        case 'unpaid':
          return 'CANCELED' as const
        default:
          return 'INCOMPLETE' as const
      }
    }

    const newTier: 'FREE' | 'PRO' =
      sub.status === 'active' || sub.status === 'trialing' ? 'PRO' : 'FREE'
    const priceId = sub.items.data[0]?.price?.id
    const sAny = sub as unknown as {
      current_period_start?: number | null
      current_period_end?: number | null
    }

    await prisma.subscription.update({
      where: { userId: session.user.id },
      data: {
        tier: newTier,
        status: mapStatus(sub.status),
        stripeSubscriptionId: sub.id,
        stripePriceId: priceId,
        currentPeriodStart: sAny.current_period_start ? new Date(sAny.current_period_start * 1000) : null,
        currentPeriodEnd: sAny.current_period_end ? new Date(sAny.current_period_end * 1000) : null,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      },
    })

    return NextResponse.json({ tier: newTier, synced: true, status: sub.status })
  } catch (err) {
    logger.error({ err, userId: session.user.id }, 'billing sync failed')
    return NextResponse.json({ tier: local.tier, synced: false, error: 'Sync failed' }, { status: 500 })
  }
}
