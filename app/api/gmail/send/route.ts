import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { sendGmailEmail } from '@/lib/gmail'
import { invalidateAppliedCache } from '@/server/routers/regions'
import { getTier, limitsFor, incrementUsage } from '@/lib/entitlements'
import { track } from '@/lib/analytics'

export interface SendResult {
  emailId: string
  companyName: string
  to: string
  status: 'sent' | 'failed' | 'skipped'
  error?: string
  gmailMessageId?: string
}

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

    // Verify campaign
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, userId: session.user.id },
    })
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Get Gmail token
    const gmailToken = await prisma.gmailToken.findUnique({
      where: { userId: session.user.id },
    })
    if (!gmailToken) {
      return NextResponse.json(
        { error: 'Gmail not connected. Connect your Gmail account first.' },
        { status: 400 }
      )
    }

    // Get valid access token (refresh if needed)
    let accessToken: string
    const isExpired = gmailToken.expiresAt && new Date() > new Date(gmailToken.expiresAt.getTime() - 60_000)
    if (isExpired) {
      if (!gmailToken.refreshToken) throw new Error('Gmail token expired and no refresh token available')
      const { refreshAccessToken } = await import('@/lib/gmail')
      const refreshed = await refreshAccessToken(gmailToken.refreshToken)
      accessToken = refreshed.accessToken
      // Persist all refreshed token fields
      await prisma.gmailToken.update({
        where: { userId: session.user.id },
        data: {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken ?? gmailToken.refreshToken,
          expiresAt: refreshed.expiresAt,
        },
      })
    } else {
      accessToken = gmailToken.accessToken
    }

    // Get user info for From header and CV attachment
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true },
    })
    const fromHeader = user?.name ? `${user.name} <${user.email}>` : user?.email ?? ''

    const profile = await prisma.userProfile.findUnique({
      where: { userId: session.user.id },
      select: { cvPdfBase64: true, jobTitle: true },
    })

    // Build CV filename from job title if available
    const cvFileName = profile?.jobTitle
      ? `CV_${profile.jobTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
      : 'CV.pdf'

    // Get all READY emails for this campaign
    const emails = await prisma.generatedEmail.findMany({
      where: { campaignId, status: 'READY' },
      include: { company: true },
    })

    if (emails.length === 0) {
      return NextResponse.json({
        error: 'No emails ready to send. Approve emails in the Review step first.',
        sent: 0,
        failed: 0,
        results: [],
      })
    }

    // Get all contact emails we've already sent to (across ALL campaigns)
    const alreadySentEmails = await prisma.generatedEmail.findMany({
      where: {
        campaign: { userId: session.user.id },
        status: { in: ['SENT', 'OPENED', 'REPLIED'] },
      },
      select: { company: { select: { contactEmail: true } } },
    })
    const sentEmailSet = new Set(
      alreadySentEmails
        .map((e) => e.company.contactEmail?.toLowerCase())
        .filter(Boolean) as string[]
    )

    const results: SendResult[] = []
    let isFirst = true

    // Plan-tier email cap (monthly). Compute up-front; counter increments after each successful send.
    const tier = await getTier(session.user.id)
    const monthlyLimit = limitsFor(tier).emailsPerMonth
    const now = new Date()
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
    const sentRow = await prisma.usageCounter.findUnique({
      where: { userId_action_period: { userId: session.user.id, action: 'email_sent', period } },
      select: { count: true },
    })
    let emailsSentThisMonth = sentRow?.count ?? 0

    for (const email of emails) {
      // Random delay between sends (2-5s) to avoid burst-sending spam triggers
      if (!isFirst) {
        await new Promise((r) => setTimeout(r, 2000 + Math.random() * 3000))
      }
      isFirst = false
      const to = email.company.contactEmail

      if (!to) {
        results.push({
          emailId: email.id,
          companyName: email.company.name,
          to: '(no email)',
          status: 'skipped',
          error: 'No contact email — try Find Email',
        })
        continue
      }

      // Skip if already sent to this email in any campaign
      if (sentEmailSet.has(to.toLowerCase())) {
        results.push({
          emailId: email.id,
          companyName: email.company.name,
          to,
          status: 'skipped',
          error: 'Already emailed this address in a previous campaign',
        })
        continue
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(to)) {
        results.push({
          emailId: email.id,
          companyName: email.company.name,
          to,
          status: 'skipped',
          error: 'Invalid email format — try Find Email',
        })
        continue
      }

      // Plan-tier monthly send cap
      if (emailsSentThisMonth >= monthlyLimit) {
        results.push({
          emailId: email.id,
          companyName: email.company.name,
          to,
          status: 'skipped',
          error: `Free tier limit reached (${monthlyLimit}/month). Upgrade to Pro to send more.`,
        })
        continue
      }

      try {
        const { messageId: gmailMessageId, threadId: gmailThreadId } = await sendGmailEmail({
          from: fromHeader,
          to,
          subject: email.subject,
          body: email.body,
          accessToken,
          cvPdfBase64: campaign.attachCv ? (profile?.cvPdfBase64 ?? undefined) : undefined,
          cvFileName: campaign.attachCv ? cvFileName : undefined,
          emailId: email.id,
        })

        await prisma.generatedEmail.update({
          where: { id: email.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            gmailMessageId,
            gmailThreadId,
          },
        })

        await prisma.company.update({
          where: { id: email.company.id },
          data: { status: 'EMAILED' },
        })

        emailsSentThisMonth += 1
        await incrementUsage(session.user.id, 'email_sent', 1)
        track(session.user.id, 'email_sent', { campaignId, tier })

        results.push({
          emailId: email.id,
          companyName: email.company.name,
          to,
          status: 'sent',
          gmailMessageId,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Send failed'
        results.push({
          emailId: email.id,
          companyName: email.company.name,
          to,
          status: 'failed',
          error: message,
        })
      }
    }

    const sentCount = results.filter((r) => r.status === 'sent').length

    // Invalidate heat map cache since new emails were sent
    if (sentCount > 0) invalidateAppliedCache(session.user.id)

    // Update campaign sent count
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        sentCount: { increment: sentCount },
        status: sentCount > 0 ? 'ACTIVE' : undefined,
      },
    })

    return NextResponse.json({
      sent: sentCount,
      failed: results.filter((r) => r.status === 'failed').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      results,
    })
  } catch (err) {
    console.error('Send error:', err)
    const message = err instanceof Error ? err.message : 'Failed to send emails'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
