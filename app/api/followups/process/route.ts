import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { generateFollowUp } from '@/lib/ai'
import { sendGmailEmail, refreshAccessToken } from '@/lib/gmail'
import { getTier, limitsFor } from '@/lib/entitlements'
import { track } from '@/lib/analytics'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Pro-only feature
  const tier = await getTier(session.user.id)
  if (!limitsFor(tier).followupsEnabled) {
    return NextResponse.json({
      error: 'Follow-ups are a Pro feature. Upgrade to enable auto follow-ups.',
      upgrade: true,
      tier,
    }, { status: 402 })
  }

  try {
    // Get Gmail token
    const gmailToken = await prisma.gmailToken.findUnique({
      where: { userId: session.user.id },
    })
    if (!gmailToken) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 })
    }

    let accessToken = gmailToken.accessToken
    const isExpired = gmailToken.expiresAt && new Date() > new Date(gmailToken.expiresAt.getTime() - 60_000)
    if (isExpired && gmailToken.refreshToken) {
      const refreshed = await refreshAccessToken(gmailToken.refreshToken)
      accessToken = refreshed.accessToken
      await prisma.gmailToken.update({
        where: { userId: session.user.id },
        data: {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken ?? gmailToken.refreshToken,
          expiresAt: refreshed.expiresAt,
        },
      })
    }

    // Get user profile for signature
    const profile = await prisma.userProfile.findUnique({
      where: { userId: session.user.id },
    })

    // Get user info for From header
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true },
    })
    const fromHeader = user?.name ? `${user.name} <${user.email}>` : user?.email ?? ''

    const signatureParts = [
      profile?.signatureName ?? '',
      profile?.signaturePhone ?? '',
      profile?.signatureAddress ?? '',
    ].filter(Boolean)
    const signatureBlock = signatureParts.length > 0 ? signatureParts.join('\n') : ''

    // Find campaigns with follow-ups enabled
    const campaigns = await prisma.campaign.findMany({
      where: { userId: session.user.id, followUpEnabled: true, status: 'ACTIVE' },
    })

    const results: Array<{
      emailId: string
      companyName: string
      sequence: number
      status: 'sent' | 'failed'
      error?: string
    }> = []

    for (const campaign of campaigns) {
      const now = new Date()
      const delayMs = campaign.followUpDelayDays * 24 * 60 * 60 * 1000

      // Find eligible emails: SENT/OPENED, no reply, with thread ID
      const emails = await prisma.generatedEmail.findMany({
        where: {
          campaignId: campaign.id,
          status: { in: ['SENT', 'OPENED'] },
          repliedAt: null,
          gmailThreadId: { not: null },
          sentAt: { not: null },
        },
        include: {
          company: true,
          followUps: { where: { status: 'SENT' }, orderBy: { sequence: 'desc' } },
        },
      })

      for (const email of emails) {
        const sentFollowUps = email.followUps.length
        if (sentFollowUps >= campaign.maxFollowUps) continue

        // Check delay: from last follow-up sentAt, or original sentAt
        const lastSentAt = email.followUps[0]?.sentAt ?? email.sentAt
        if (!lastSentAt || now.getTime() - lastSentAt.getTime() < delayMs) continue

        const sequence = sentFollowUps + 1

        try {
          const generated = await generateFollowUp({
            originalSubject: email.subject,
            originalBody: email.body,
            companyName: email.company.name,
            contactName: email.company.contactName,
            sequence,
            cvText: profile?.cvText ?? '',
            jobTitle: campaign.jobTitle ?? profile?.jobTitle ?? '',
            userId: session.user.id,
          })

          let body = generated.body
          if (signatureBlock) body = `${body}\n${signatureBlock}`

          const to = email.company.contactEmail
          if (!to) {
            results.push({ emailId: email.id, companyName: email.company.name, sequence, status: 'failed', error: 'No contact email' })
            continue
          }

          const { messageId } = await sendGmailEmail({
            from: fromHeader,
            to,
            subject: generated.subject,
            body,
            accessToken,
            threadId: email.gmailThreadId!,
            inReplyTo: email.gmailMessageId!,
            references: email.gmailMessageId!,
          })

          await prisma.followUp.create({
            data: {
              emailId: email.id,
              sequence,
              scheduledAt: now,
              sentAt: now,
              gmailMessageId: messageId,
              subject: generated.subject,
              body,
              status: 'SENT',
            },
          })

          results.push({ emailId: email.id, companyName: email.company.name, sequence, status: 'sent' })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Follow-up failed'
          results.push({ emailId: email.id, companyName: email.company.name, sequence, status: 'failed', error: message })
        }
      }
    }

    return NextResponse.json({
      processed: results.length,
      sent: results.filter((r) => r.status === 'sent').length,
      failed: results.filter((r) => r.status === 'failed').length,
      results,
    })
  } catch (err) {
    console.error('Follow-up process error:', err)
    const message = err instanceof Error ? err.message : 'Failed to process follow-ups'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
