import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { sendGmailEmail, getValidAccessToken } from '@/lib/gmail'

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
    const accessToken = await getValidAccessToken(gmailToken)

    // Update stored token if refreshed
    if (accessToken !== gmailToken.accessToken) {
      await prisma.gmailToken.update({
        where: { userId: session.user.id },
        data: { accessToken },
      })
    }

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

    const results: SendResult[] = []

    for (const email of emails) {
      const to = email.company.contactEmail

      if (!to) {
        results.push({
          emailId: email.id,
          companyName: email.company.name,
          to: '(no email)',
          status: 'skipped',
          error: 'No contact email for this company',
        })
        continue
      }

      try {
        const gmailMessageId = await sendGmailEmail({
          to,
          subject: email.subject,
          body: email.body,
          accessToken,
        })

        await prisma.generatedEmail.update({
          where: { id: email.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            gmailMessageId,
          },
        })

        await prisma.company.update({
          where: { id: email.company.id },
          data: { status: 'EMAILED' },
        })

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
