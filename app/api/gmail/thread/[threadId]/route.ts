import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getThreadMessages, parseThreadMessages } from '@/lib/gmail'
import { resolveOwnedThread } from '@/lib/gmail-token'
import { withAuthParams } from '@/lib/api-auth'

export const GET = withAuthParams<{ threadId: string }, NextResponse>(async (_req, { userId, params }) => {
  const { threadId } = params

  const thread = await resolveOwnedThread(threadId, userId)
  if (!thread.ok) return thread.response
  const { accessToken } = thread

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
    const rawMessages = await getThreadMessages(accessToken, threadId)
    const messages = parseThreadMessages(rawMessages, user?.email ?? '')
    return NextResponse.json({ messages })
  } catch (err) {
    console.error('Thread fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch thread' }, { status: 500 })
  }
})
