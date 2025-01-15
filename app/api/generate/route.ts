import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { generateEmail } from '@/lib/ai'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json() as { campaignId: string }
    const { campaignId } = body

    if (!campaignId) {
      return NextResponse.json({ error: 'campaignId required' }, { status: 400 })
    }

    // Verify campaign belongs to user
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, userId: session.user.id },
      include: {
        companies: { where: { status: { not: 'ARCHIVED' } } },
      },
    })

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId: session.user.id },
    })

    if (!profile?.cvText) {
      return NextResponse.json({ error: 'No CV found. Upload your CV first.' }, { status: 400 })
    }

    const results: Array<{
      companyId: string
      companyName: string
      emailId?: string
      error?: string
    }> = []

    for (const company of campaign.companies) {
      try {
        // Delete existing DRAFT emails for this company in this campaign
        await prisma.generatedEmail.deleteMany({
          where: { companyId: company.id, campaignId, status: 'DRAFT' },
        })

        const generated = await generateEmail({
          cvText: profile.cvText,
          jobTitle: campaign.jobTitle ?? profile.jobTitle ?? 'Software Engineer',
          companyName: company.name,
          companyIndustry: company.industry,
          companyDescription: company.description,
          companySize: company.size,
          contactName: company.contactName,
        })

        const email = await prisma.generatedEmail.create({
          data: {
            companyId: company.id,
            campaignId,
            subject: generated.subject,
            body: generated.body,
            status: 'DRAFT',
          },
        })

        results.push({ companyId: company.id, companyName: company.name, emailId: email.id })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Generation failed'
        results.push({ companyId: company.id, companyName: company.name, error: message })
      }
    }

    // Update campaign counts
    const emailCount = await prisma.generatedEmail.count({ where: { campaignId } })
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { targetCount: campaign.companies.length, status: 'ACTIVE' },
    })

    return NextResponse.json({
      generated: results.filter((r) => !r.error).length,
      failed: results.filter((r) => r.error).length,
      total: emailCount,
      results,
    })
  } catch (err) {
    console.error('Generate error:', err)
    const message = err instanceof Error ? err.message : 'Failed to generate emails'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
