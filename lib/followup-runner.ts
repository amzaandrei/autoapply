import { prisma } from './prisma'
import { generateFollowUp } from './ai'
import { sendGmailEmail } from './gmail'
import { getGmailAccessTokenForUser, GmailNotConnectedError } from './gmail-token'
import { getTier, limitsFor, incrementUsage } from './entitlements'

interface FollowUpResult {
  emailId: string
  companyName: string
  sequence: number
  status: 'sent' | 'failed'
  error?: string
}

interface FollowUpRunSummary {
  processed: number
  sent: number
  failed: number
  skipped: 'not_pro' | 'no_gmail' | null
  results: FollowUpResult[]
}

export async function processFollowUpsForUser(userId: string): Promise<FollowUpRunSummary> {
  const empty: FollowUpRunSummary = { processed: 0, sent: 0, failed: 0, skipped: null, results: [] }

  const tier = await getTier(userId)
  if (!limitsFor(tier).followupsEnabled) {
    return { ...empty, skipped: 'not_pro' }
  }

  let accessToken: string
  try {
    accessToken = await getGmailAccessTokenForUser(userId)
  } catch (err) {
    if (err instanceof GmailNotConnectedError) return { ...empty, skipped: 'no_gmail' }
    throw err
  }

  const [user, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    prisma.userProfile.findUnique({ where: { userId } }),
  ])
  const fromHeader = user?.name ? `${user.name} <${user.email}>` : user?.email ?? ''
  const signatureBlock = [
    profile?.signatureName ?? '',
    profile?.signaturePhone ?? '',
    profile?.signatureAddress ?? '',
  ]
    .filter(Boolean)
    .join('\n')

  const campaigns = await prisma.campaign.findMany({
    where: { userId, followUpEnabled: true, status: 'ACTIVE' },
  })

  const results: FollowUpResult[] = []

  for (const campaign of campaigns) {
    const now = new Date()
    const delayMs = campaign.followUpDelayDays * 24 * 60 * 60 * 1000

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

      const lastSentAt = email.followUps[0]?.sentAt ?? email.sentAt
      if (!lastSentAt || now.getTime() - lastSentAt.getTime() < delayMs) continue

      const sequence = sentFollowUps + 1

      const to = email.company.contactEmail
      if (!to) {
        results.push({
          emailId: email.id,
          companyName: email.company.name,
          sequence,
          status: 'failed',
          error: 'No contact email',
        })
        continue
      }

      try {
        const generated = await generateFollowUp({
          originalSubject: email.subject,
          originalBody: email.body,
          companyName: email.company.name,
          contactName: email.company.contactName,
          sequence,
          cvText: profile?.cvText ?? '',
          jobTitle: campaign.jobTitle ?? profile?.jobTitle ?? '',
          userId,
        })

        const body = signatureBlock ? `${generated.body}\n${signatureBlock}` : generated.body

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

        await incrementUsage(userId, 'follow_up', 1)
        results.push({ emailId: email.id, companyName: email.company.name, sequence, status: 'sent' })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Follow-up failed'
        results.push({
          emailId: email.id,
          companyName: email.company.name,
          sequence,
          status: 'failed',
          error: message,
        })
      }
    }
  }

  return {
    processed: results.length,
    sent: results.filter((r) => r.status === 'sent').length,
    failed: results.filter((r) => r.status === 'failed').length,
    skipped: null,
    results,
  }
}
