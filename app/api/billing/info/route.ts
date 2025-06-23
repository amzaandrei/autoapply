import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { getUsage } from '@/lib/entitlements'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const [sub, usage] = await Promise.all([
    prisma.subscription.findUnique({
      where: { userId: session.user.id },
      select: {
        tier: true,
        status: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
      },
    }),
    getUsage(session.user.id),
  ])
  return NextResponse.json({
    subscription: sub ?? { tier: 'FREE', status: 'ACTIVE', currentPeriodEnd: null, cancelAtPeriodEnd: false },
    usage,
  })
}
