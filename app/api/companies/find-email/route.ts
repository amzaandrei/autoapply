import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { findCompanyContactEmail } from '@/lib/ai'
import { hunterFindHiringEmail } from '@/lib/hunter'
import { validateEmail } from '@/lib/email-validator'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { companyId } = await request.json() as { companyId: string }
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

    // Rate limit: max 20 find-email lookups per hour
    const limit = rateLimit(`find-email:${session.user.id}`, 20, 60 * 60 * 1000)
    if (!limit.allowed) {
      return NextResponse.json({
        error: `Too many Find Email requests. Try again in ${Math.ceil(limit.resetIn / 60)} minutes.`,
      }, { status: 429 })
    }

    // Verify ownership
    const company = await prisma.company.findFirst({
      where: { id: companyId, campaign: { userId: session.user.id } },
      select: { id: true, name: true, domain: true, contactEmail: true },
    })
    if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Try Hunter.io first (precise, database-backed) — falls through if no key or no result
    let foundEmail: string | null = null
    let reasoning = ''
    let source: 'hunter' | 'ai' | null = null

    if (company.domain) {
      const hunterResult = await hunterFindHiringEmail(company.domain)
      if (hunterResult) {
        foundEmail = hunterResult
        source = 'hunter'
        reasoning = `Found via Hunter.io database`
      }
    }

    // Fall back to AI web search
    if (!foundEmail) {
      const aiResult = await findCompanyContactEmail({ companyName: company.name, domain: company.domain })
      foundEmail = aiResult.email?.trim() ?? null
      reasoning = aiResult.reasoning
      source = 'ai'
    }

    if (!foundEmail) {
      return NextResponse.json({
        found: false,
        reasoning: reasoning || 'No email found via Hunter.io or AI search',
        previousEmail: company.contactEmail,
      })
    }

    // Don't "find" the same bad email we already had
    if (foundEmail.toLowerCase() === company.contactEmail?.toLowerCase()) {
      return NextResponse.json({
        found: false,
        reasoning: 'Could not find a better email than the current one',
        previousEmail: company.contactEmail,
      })
    }

    // Validate via MX lookup
    const validation = await validateEmail(foundEmail)
    if (!validation.valid) {
      return NextResponse.json({
        found: false,
        email: foundEmail,
        reasoning: `Found but invalid: ${validation.reason}`,
        previousEmail: company.contactEmail,
      })
    }

    // Save the new email
    await prisma.company.update({
      where: { id: companyId },
      data: { contactEmail: foundEmail },
    })

    // Reset any BOUNCED / failed emails to READY so they can be retried
    await prisma.generatedEmail.updateMany({
      where: { companyId, status: 'BOUNCED' },
      data: { status: 'READY' },
    })

    return NextResponse.json({
      found: true,
      email: foundEmail,
      reasoning,
      source,
      previousEmail: company.contactEmail,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
