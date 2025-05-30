import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const campaign = await prisma.campaign.findFirst({
    where: { id, userId: session.user.id },
    include: {
      companies: {
        include: { emails: { orderBy: { createdAt: 'desc' }, take: 1 } },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const headers = ['Company', 'Industry', 'Size', 'Contact Email', 'Contact Name', 'Domain', 'Company Status', 'Email Subject', 'Email Status', 'Sent At', 'Opened At', 'Replied At', 'Notes']

  const rows = campaign.companies.map((c) => {
    const email = c.emails[0]
    return [
      c.name,
      c.industry ?? '',
      c.size ?? '',
      c.contactEmail ?? '',
      c.contactName ?? '',
      c.domain ?? '',
      c.status,
      email?.subject ?? '',
      email?.status ?? '',
      email?.sentAt?.toISOString() ?? '',
      email?.openedAt?.toISOString() ?? '',
      email?.repliedAt?.toISOString() ?? '',
      c.notes ?? '',
    ]
  })

  function escapeCsv(val: string): string {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`
    }
    return val
  }

  const csv = [headers.join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${campaign.name.replace(/[^a-zA-Z0-9]/g, '_')}_export.csv"`,
    },
  })
}
