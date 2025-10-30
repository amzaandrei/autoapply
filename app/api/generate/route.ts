import { NextResponse } from 'next/server'
import type { Company, UserProfile } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { generateEmail, type EmailTone } from '@/lib/ai'
import { resolveContactEmail } from '@/lib/contact-resolver'
import { rateLimit, rateLimitBulk } from '@/lib/rate-limit'
import { randomUUID } from 'crypto'
import { checkQuota, incrementUsage } from '@/lib/entitlements'
import { track } from '@/lib/analytics'
import { withAuth } from '@/lib/api-auth'

function withSignature(body: string, signatureBlock: string): string {
  return signatureBlock ? `${body}\n${signatureBlock}` : body
}

function runGenerateEmail(
  company: Company,
  cvText: string,
  skills: UserProfile['skills'],
  jobTitle: string,
  tone: EmailTone | undefined,
  hint: string | undefined,
  userId: string,
) {
  return generateEmail({
    cvText,
    jobTitle,
    companyName: company.name,
    companyIndustry: company.industry,
    companyDescription: company.description,
    companySize: company.size,
    contactName: company.contactName,
    yearFounded: company.yearFounded,
    country: company.country,
    techStack: company.techStack,
    skills: skills ?? [],
    tone,
    hint,
    userId,
  })
}

export const POST = withAuth(async (request, { userId }) => {
  try {
    const body = await request.json() as { campaignId: string; companyId?: string; tone?: 'concise' | 'balanced' | 'detailed'; hint?: string }
    const { campaignId, companyId, tone, hint } = body

    if (!campaignId) {
      return NextResponse.json({ error: 'campaignId required' }, { status: 400 })
    }

    // Verify campaign belongs to user
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, userId: userId },
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
      where: { userId: userId },
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
    const limit = rateLimitBulk(`generate:${userId}`, estimatedCalls, 200, 60 * 60 * 1000)
    if (!limit.allowed) {
      return NextResponse.json({
        error: `Rate limit: you've generated too many emails recently. Try again in ${Math.ceil(limit.resetIn / 60)} minutes.`,
      }, { status: 429 })
    }

    // Plan quota: monthly AI generations cap
    const quota = await checkQuota(userId, 'ai_generation', estimatedCalls)
    if (!quota.allowed) {
      return NextResponse.json({
        error: `Monthly AI generation limit reached (${quota.limit}/month on ${quota.tier}). You have ${quota.remaining} left. Upgrade to Pro for unlimited generations.`,
        upgrade: quota.tier === 'FREE',
        tier: quota.tier,
        remaining: quota.remaining,
      }, { status: 402 })
    }

    // Build signature block (appended to every email)
    const signatureParts = [
      profile.signatureName ?? '',
      profile.signaturePhone ?? '',
      profile.signatureAddress ?? '',
    ].filter(Boolean)
    const signatureBlock = signatureParts.length > 0 ? signatureParts.join('\n') : ''

    // Verified-only gate: for every company with a contact email, confirm
    // deliverability via Hunter.io (or MX fallback). This prevents the AI from
    // burning tokens on addresses that will bounce — which both wastes quota
    // and damages the user's Gmail sender reputation.
    const verdictByCompanyId = new Map<string, Awaited<ReturnType<typeof resolveContactEmail>>>()
    for (const c of campaign.companies) {
      if (!c.contactEmail) continue
      verdictByCompanyId.set(c.id, await resolveContactEmail(c, userId))
    }

    // Get emails already sent across ALL campaigns
    const alreadySent = await prisma.generatedEmail.findMany({
      where: {
        campaign: { userId: userId },
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
          results.push({ companyId: company.id, companyName: company.name, error: 'No contact email' })
          continue
        }
        // Skip obviously malformed emails (saves AI tokens)
        if (!emailRegex.test(company.contactEmail)) {
          results.push({ companyId: company.id, companyName: company.name, error: `Invalid email format: ${company.contactEmail}` })
          continue
        }
        const emailLower = company.contactEmail.toLowerCase()
        // Skip addresses that failed deliverability verification
        const verdict = verdictByCompanyId.get(company.id)
        if (verdict?.kind === 'invalid_email') {
          results.push({ companyId: company.id, companyName: company.name, error: `Unverified: ${verdict.reason}` })
          continue
        }
        if (verdict?.kind === 'risky_email') {
          results.push({ companyId: company.id, companyName: company.name, error: `Unverified: ${verdict.reason}` })
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
          const subject = `Application at ${company.name}`
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
            const generated = await runGenerateEmail(company, profile.cvText, profile.skills, jobTitle, variantTone, hint, userId)
            const body = withSignature(generated.body, signatureBlock)
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
          const generated = await runGenerateEmail(company, profile.cvText, profile.skills, jobTitle, tone, hint, userId)
          const body = withSignature(generated.body, signatureBlock)
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

    // Charge usage only for successful generations
    if (generatedCount > 0) {
      await incrementUsage(userId, 'ai_generation', generatedCount)
      track(userId, 'emails_generated', { count: generatedCount, failed: results.filter((r) => r.error).length })
    }

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
})
