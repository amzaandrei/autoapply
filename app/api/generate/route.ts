import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { generateEmail, type EmailTone } from '@/lib/ai'
import { validateEmails } from '@/lib/email-validator'
import { rateLimit, rateLimitBulk } from '@/lib/rate-limit'
import { randomUUID } from 'crypto'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json() as { campaignId: string; companyId?: string; tone?: 'concise' | 'balanced' | 'detailed' }
    const { campaignId, companyId, tone } = body

    if (!campaignId) {
      return NextResponse.json({ error: 'campaignId required' }, { status: 400 })
    }

    // Verify campaign belongs to user
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, userId: session.user.id },
      include: {
        companies: {
          where: {
            status: { not: 'ARCHIVED' },
            ...(companyId ? { id: companyId } : {}),
          },
        },
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

    // Rate limit: max 200 AI email generations per user per hour
    // (with A/B doubling, this covers 100 companies / hour at worst)
    // Estimate only the companies that would actually hit the AI (skip ones without any email)
    const eligibleCompanies = campaign.companies.filter((c) => c.contactEmail)
    const estimatedCalls = eligibleCompanies.length * (campaign.abTestEnabled && !campaign.useEmailTemplate ? 2 : 1)
    const limit = rateLimitBulk(`generate:${session.user.id}`, estimatedCalls, 200, 60 * 60 * 1000)
    if (!limit.allowed) {
      return NextResponse.json({
        error: `Rate limit: you've generated too many emails recently. Try again in ${Math.ceil(limit.resetIn / 60)} minutes.`,
      }, { status: 429 })
    }

    // Build signature block (appended to every email)
    const signatureParts = [
      profile.signatureName ?? '',
      profile.signaturePhone ?? '',
      profile.signatureAddress ?? '',
    ].filter(Boolean)
    const signatureBlock = signatureParts.length > 0 ? signatureParts.join('\n') : ''

    // Pre-validate emails to skip companies with invalid/non-existent addresses
    // Saves AI tokens by not generating for emails that would bounce
    const contactEmails = campaign.companies.map((c) => c.contactEmail).filter(Boolean) as string[]
    const validations = await validateEmails(contactEmails)
    const invalidEmails = new Set(validations.filter((v) => !v.valid).map((v) => v.email.toLowerCase()))
    const invalidReasonMap = new Map(validations.filter((v) => !v.valid).map((v) => [v.email.toLowerCase(), v.reason]))

    // Get emails already sent across ALL campaigns
    const alreadySent = await prisma.generatedEmail.findMany({
      where: {
        campaign: { userId: session.user.id },
        status: { in: ['SENT', 'OPENED', 'REPLIED'] },
      },
      select: { company: { select: { contactEmail: true } } },
    })
    const alreadySentSet = new Set(
      alreadySent.map((e) => e.company.contactEmail?.toLowerCase()).filter(Boolean) as string[]
    )

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    for (const company of campaign.companies) {
      try {
        // Skip companies without ANY contact email (saves AI tokens — can't send anyway)
        if (!company.contactEmail) {
          results.push({ companyId: company.id, companyName: company.name, error: 'No contact email — use Find Email first' })
          continue
        }
        // Skip obviously malformed emails (saves AI tokens)
        if (!emailRegex.test(company.contactEmail)) {
          results.push({ companyId: company.id, companyName: company.name, error: `Invalid email format: ${company.contactEmail}` })
          continue
        }
        const emailLower = company.contactEmail.toLowerCase()
        // Skip emails whose domain has no MX record (already validated earlier in flow)
        if (invalidEmails.has(emailLower)) {
          const reason = invalidReasonMap.get(emailLower) ?? 'invalid'
          results.push({ companyId: company.id, companyName: company.name, error: `Invalid email: ${reason}` })
          continue
        }
        // Skip emails already sent to in a previous campaign
        if (alreadySentSet.has(emailLower)) {
          results.push({ companyId: company.id, companyName: company.name, error: 'Already emailed in previous campaign' })
          continue
        }

        // Delete existing DRAFT emails for this company in this campaign
        await prisma.generatedEmail.deleteMany({
          where: { companyId: company.id, campaignId, status: 'DRAFT' },
        })

        const jobTitle = campaign.jobTitle ?? profile.jobTitle ?? 'Software Engineer'
        const defaultTemplate = `Dear Hiring Team,\n\nI'm reaching out about opportunities at {{company}}. I'm very interested in a {{position}} role and believe my background is a strong match.\n\nI'd love to discuss how my experience could contribute to your team.\n\nBest regards,`

        if (campaign.useEmailTemplate) {
          let body = (profile.emailTemplate?.trim() || defaultTemplate)
            .replace(/\{\{company\}\}/g, company.name)
            .replace(/\{\{position\}\}/g, jobTitle)
            .replace(/\{\{[^}]+\}\}/g, '')
          const subject = `Application for ${jobTitle} at ${company.name}`
          if (signatureBlock) body = `${body}\n${signatureBlock}`

          const email = await prisma.generatedEmail.create({
            data: { companyId: company.id, campaignId, subject, body, status: 'DRAFT' },
          })
          results.push({ companyId: company.id, companyName: company.name, emailId: email.id })
        } else if (campaign.abTestEnabled) {
          // A/B: generate 2 variants
          const abGroup = randomUUID()
          for (const variant of ['A', 'B'] as const) {
            const variantTone = (variant === 'A' ? campaign.abToneA : campaign.abToneB) as EmailTone
            const generated = await generateEmail({
              cvText: profile.cvText,
              jobTitle,
              companyName: company.name,
              companyIndustry: company.industry,
              companyDescription: company.description,
              companySize: company.size,
              contactName: company.contactName,
              skills: profile.skills ?? [],
              tone: variantTone,
            })
            let body = generated.body
            if (signatureBlock) body = `${body}\n${signatureBlock}`

            await prisma.generatedEmail.create({
              data: {
                companyId: company.id,
                campaignId,
                subject: generated.subject,
                body,
                status: 'DRAFT',
                variant,
                abGroup,
              },
            })
          }
          results.push({ companyId: company.id, companyName: company.name })
        } else {
          // Single AI generation
          const generated = await generateEmail({
            cvText: profile.cvText,
            jobTitle,
            companyName: company.name,
            companyIndustry: company.industry,
            companyDescription: company.description,
            companySize: company.size,
            contactName: company.contactName,
            skills: profile.skills ?? [],
            tone,
          })
          let body = generated.body
          if (signatureBlock) body = `${body}\n${signatureBlock}`

          const email = await prisma.generatedEmail.create({
            data: { companyId: company.id, campaignId, subject: generated.subject, body, status: 'DRAFT' },
          })
          results.push({ companyId: company.id, companyName: company.name, emailId: email.id })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Generation failed'
        results.push({ companyId: company.id, companyName: company.name, error: message })
      }
    }

    // Update campaign counts
    const emailCount = await prisma.generatedEmail.count({ where: { campaignId } })
    const generatedCount = results.filter((r) => !r.error).length
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        targetCount: campaign.companies.length,
        ...(generatedCount > 0 ? { status: 'ACTIVE' } : {}),
      },
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
