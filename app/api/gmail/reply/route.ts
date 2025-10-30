import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendGmailEmail } from '@/lib/gmail'
import { resolveOwnedThread } from '@/lib/gmail-token'
import { withAuth } from '@/lib/api-auth'

export const POST = withAuth(async (request, { userId }) => {
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

  const thread = await resolveOwnedThread(body.threadId, userId)
  if (!thread.ok) return thread.response
  const { accessToken } = thread

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
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
})
