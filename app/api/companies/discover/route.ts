import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { discoverCompanies } from '@/lib/ai'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json() as {
      campaignId: string
      jobTitle: string
      industry: string
      region: string
      additionalContext?: string
      saveResults?: boolean
    }

    const { campaignId, jobTitle, industry, region, additionalContext, saveResults } = body

    if (!campaignId || !jobTitle || !industry || !region) {
      return NextResponse.json(
        { error: 'campaignId, jobTitle, industry, and region are required' },
        { status: 400 }
      )
    }

    // Verify campaign
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, userId: session.user.id },
    })
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const companies = await discoverCompanies({ jobTitle, industry, region, additionalContext })

    if (saveResults && companies.length > 0) {
      await prisma.company.createMany({
        data: companies.map((c) => ({
          campaignId,
          name: c.name,
          domain: c.domain || undefined,
          industry: c.industry || undefined,
          size: c.size || undefined,
          description: `${c.description}\n\nMatch reason: ${c.matchReason}`,
          contactEmail: c.contactEmail || undefined,
          contactName: c.contactName || undefined,
          linkedIn: c.linkedIn || undefined,
          status: 'PENDING' as const,
        })),
        skipDuplicates: true,
      })
    }

    return NextResponse.json({ companies, saved: saveResults ? companies.length : 0 })
  } catch (err) {
    console.error('Discover error:', err)
    const message = err instanceof Error ? err.message : 'Discovery failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
