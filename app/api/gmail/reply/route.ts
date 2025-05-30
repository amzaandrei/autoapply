import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { sendGmailEmail, refreshAccessToken } from '@/lib/gmail'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    threadId: string
    inReplyTo: string
    to: string
    subject: string
    body: string
  }

  if (!body.threadId || !body.to || !body.body) {
    return NextResponse.json({ error: 'threadId, to, and body are required' }, { status: 400 })
  }

  // Verify thread belongs to user
  const email = await prisma.generatedEmail.findFirst({
    where: { gmailThreadId: body.threadId, campaign: { userId: session.user.id } },
  })
  if (!email) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

  const gmailToken = await prisma.gmailToken.findUnique({ where: { userId: session.user.id } })
  if (!gmailToken) return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 })

  let accessToken = gmailToken.accessToken
  const isExpired = gmailToken.expiresAt && new Date() > new Date(gmailToken.expiresAt.getTime() - 60_000)
  if (isExpired && gmailToken.refreshToken) {
    const refreshed = await refreshAccessToken(gmailToken.refreshToken)
    accessToken = refreshed.accessToken
    await prisma.gmailToken.update({
      where: { userId: session.user.id },
      data: { accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken ?? gmailToken.refreshToken, expiresAt: refreshed.expiresAt },
    })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true },
    })
    const fromHeader = user?.name ? `${user.name} <${user.email}>` : user?.email ?? ''

    const subject = body.subject.startsWith('Re: ') ? body.subject : `Re: ${body.subject}`
    const result = await sendGmailEmail({
      from: fromHeader,
      to: body.to,
      subject,
      body: body.body,
      accessToken,
      threadId: body.threadId,
      inReplyTo: body.inReplyTo,
      references: body.inReplyTo,
    })
    return NextResponse.json({ messageId: result.messageId, threadId: result.threadId })
  } catch (err) {
    console.error('Reply error:', err)
    const message = err instanceof Error ? err.message : 'Failed to send reply'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
