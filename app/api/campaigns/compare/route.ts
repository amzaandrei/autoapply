import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const campaigns = await prisma.campaign.findMany({
    where: { userId: session.user.id },
    include: {
      emails: { select: { status: true, openedAt: true, repliedAt: true, variant: true } },
      _count: { select: { companies: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const comparison = campaigns.map((c) => {
    const sent = c.emails.filter((e) => ['SENT', 'OPENED', 'REPLIED'].includes(e.status))
    const opened = sent.filter((e) => e.openedAt)
    const replied = sent.filter((e) => e.repliedAt)
    return {
      id: c.id,
      name: c.name,
      jobTitle: c.jobTitle,
      status: c.status,
      companies: c._count.companies,
      sent: sent.length,
      opened: opened.length,
      replied: replied.length,
      openRate: sent.length > 0 ? Math.round((opened.length / sent.length) * 100) : 0,
      replyRate: sent.length > 0 ? Math.round((replied.length / sent.length) * 100) : 0,
      useEmailTemplate: c.useEmailTemplate,
      abTestEnabled: c.abTestEnabled,
      createdAt: c.createdAt,
    }
  })

  return NextResponse.json({ campaigns: comparison })
}
