import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { stripe, appUrl } from '@/lib/stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sub = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
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
}
