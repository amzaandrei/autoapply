import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuthParams } from '@/lib/api-auth'

export const GET = withAuthParams<{ id: string }, NextResponse>(async (_req, { userId, params }) => {
  const { id } = params
  const campaign = await prisma.campaign.findFirst({ where: { id, userId } })
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const emails = await prisma.generatedEmail.findMany({
    where: { campaignId: id, status: { in: ['SENT', 'OPENED', 'REPLIED'] } },
    include: { company: { select: { name: true, contactEmail: true, industry: true, size: true } } },
  })

  // Replied emails with details
  const repliedEmails = emails
    .filter((e) => e.status === 'REPLIED' && e.repliedAt)
    .map((e) => ({
      id: e.id,
      companyName: e.company.name,
      contactEmail: e.company.contactEmail,
      subject: e.subject,
      body: e.body,
      sentAt: e.sentAt,
      repliedAt: e.repliedAt,
      variant: e.variant,
      gmailThreadId: e.gmailThreadId,
    }))

  const total = emails.length
  const opened = emails.filter((e) => e.openedAt).length
  const replied = emails.filter((e) => e.repliedAt).length

  // Per variant
  const variantA = emails.filter((e) => e.variant === 'A')
  const variantB = emails.filter((e) => e.variant === 'B')

  const variantStats = (list: typeof emails) => ({
    sent: list.length,
    opened: list.filter((e) => e.openedAt).length,
    replied: list.filter((e) => e.repliedAt).length,
    openRate: list.length > 0 ? Math.round((list.filter((e) => e.openedAt).length / list.length) * 100) : 0,
    replyRate: list.length > 0 ? Math.round((list.filter((e) => e.repliedAt).length / list.length) * 100) : 0,
  })

  // Per industry
  const industries = new Map<string, typeof emails>()
  for (const e of emails) {
    const key = e.company.industry ?? 'Unknown'
    industries.set(key, [...(industries.get(key) ?? []), e])
  }

  // Per company size
  const sizes = new Map<string, typeof emails>()
  for (const e of emails) {
    const key = e.company.size ?? 'Unknown'
    sizes.set(key, [...(sizes.get(key) ?? []), e])
  }

  return NextResponse.json({
    overall: {
      sent: total,
      opened,
      replied,
      openRate: total > 0 ? Math.round((opened / total) * 100) : 0,
      replyRate: total > 0 ? Math.round((replied / total) * 100) : 0,
    },
    variants: {
      A: variantStats(variantA),
      B: variantStats(variantB),
      hasData: variantA.length > 0 || variantB.length > 0,
    },
    byIndustry: Object.fromEntries(
      [...industries.entries()].map(([k, v]) => [k, variantStats(v)])
    ),
    bySize: Object.fromEntries(
      [...sizes.entries()].map(([k, v]) => [k, variantStats(v)])
    ),
    repliedEmails,
  })
})
