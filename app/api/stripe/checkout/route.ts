import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { stripe, requirePriceIdFor, appUrl, isPaidPlan } from '@/lib/stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const email = session.user.email

  // Plan selection — default to PRO to preserve old clients that just POSTed
  // without a body. New clients send { plan: 'STARTER' | 'PRO' | 'POWER' }.
  let plan: 'STARTER' | 'PRO' | 'POWER' = 'PRO'
  try {
    const body = await request.json().catch(() => null)
    if (body && isPaidPlan(body.plan)) plan = body.plan
  } catch {
    // No body is fine — PRO default.
  }

  const priceId = requirePriceIdFor(plan)

  let sub = await prisma.subscription.findUnique({ where: { userId } })
  let customerId = sub?.stripeCustomerId

  if (!customerId) {
    const customer = await stripe().customers.create({
      email,
      metadata: { userId },
    })
    customerId = customer.id
    sub = await prisma.subscription.upsert({
      where: { userId },
      create: { userId, stripeCustomerId: customerId },
      update: { stripeCustomerId: customerId },
    })
  }

  const base = appUrl()
  const checkout = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${base}/billing?success=1`,
    cancel_url: `${base}/billing?canceled=1`,
    subscription_data: { metadata: { userId, plan } },
    client_reference_id: userId,
  })

  if (!checkout.url) {
    return NextResponse.json({ error: 'Checkout URL missing' }, { status: 500 })
  }

  return NextResponse.json({ url: checkout.url })
}
