import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { stripe, appUrl } from '@/lib/stripe'
import { withAuthNoReq } from '@/lib/api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = withAuthNoReq(async ({ userId }) => {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { stripeCustomerId: true },
  })
  if (!sub?.stripeCustomerId) {
    return NextResponse.json({ error: 'No Stripe customer on file' }, { status: 400 })
  }

  const portal = await stripe().billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${appUrl()}/billing`,
  })

  return NextResponse.json({ url: portal.url })
})
