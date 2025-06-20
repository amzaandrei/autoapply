import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { validateEmails } from '@/lib/email-validator'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { campaignId } = await request.json() as { campaignId: string }

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, userId: session.user.id },
      include: {
        companies: {
          where: { status: { not: 'ARCHIVED' } },
          select: { id: true, name: true, contactEmail: true },
        },
      },
    })
    if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const emails = campaign.companies.map((c) => c.contactEmail).filter(Boolean) as string[]
    const results = await validateEmails(emails)

    // Map back to companies and archive invalid ones
    const invalidIds: string[] = []
    const validationMap = new Map(results.map((r) => [r.email.toLowerCase(), r]))

    const report = campaign.companies.map((c) => {
      if (!c.contactEmail) {
        return { companyId: c.id, name: c.name, email: null, valid: false, reason: 'no email' }
      }
      const result = validationMap.get(c.contactEmail.toLowerCase())
      if (result && !result.valid) invalidIds.push(c.id)
      return {
        companyId: c.id,
        name: c.name,
        email: c.contactEmail,
        valid: result?.valid ?? false,
        reason: result?.reason,
      }
    })

    // Archive invalid ones so they won't be sent or generated
    if (invalidIds.length > 0) {
      await prisma.company.updateMany({
        where: { id: { in: invalidIds } },
        data: { status: 'ARCHIVED' },
      })
    }

    return NextResponse.json({
      total: report.length,
      valid: report.filter((r) => r.valid).length,
      invalid: report.filter((r) => !r.valid).length,
      archived: invalidIds.length,
      report,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Validation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
