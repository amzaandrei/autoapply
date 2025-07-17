import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { discoverSimilarCompanies } from '@/lib/ai'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { campaignId } = await request.json() as { campaignId: string }
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, userId: session.user.id },
      include: { companies: { where: { status: { not: 'ARCHIVED' } }, select: { name: true, industry: true, size: true } } },
    })
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    if (campaign.companies.length === 0) return NextResponse.json({ error: 'No companies to base search on' }, { status: 400 })

    const companies = await discoverSimilarCompanies({
      existingCompanies: campaign.companies,
      jobTitle: campaign.jobTitle ?? 'Software Engineer',
      region: 'Global',
      userId: session.user.id,
    })

    return NextResponse.json({ companies })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
