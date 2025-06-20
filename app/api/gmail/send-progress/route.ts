import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

// Returns live counts of READY/SENT/failed emails for a campaign.
// Polled by the frontend during send to show real progress.

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const campaignId = request.nextUrl.searchParams.get('campaignId')
  if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 })

  // Verify campaign ownership
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, userId: session.user.id },
  })
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const grouped = await prisma.generatedEmail.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: true,
  })

  const counts: Record<string, number> = {}
  for (const g of grouped) counts[g.status] = g._count

  return NextResponse.json({
    ready: counts.READY ?? 0,
    sent: counts.SENT ?? 0,
    opened: counts.OPENED ?? 0,
    replied: counts.REPLIED ?? 0,
    bounced: counts.BOUNCED ?? 0,
  })
}
