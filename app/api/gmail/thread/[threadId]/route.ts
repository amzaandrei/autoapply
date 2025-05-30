import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { getThreadMessages, parseThreadMessages, refreshAccessToken } from '@/lib/gmail'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { threadId } = await params

  // Verify thread belongs to user's campaign
  const email = await prisma.generatedEmail.findFirst({
    where: { gmailThreadId: threadId, campaign: { userId: session.user.id } },
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
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true } })
    const rawMessages = await getThreadMessages(accessToken, threadId)
    const messages = parseThreadMessages(rawMessages, user?.email ?? '')
    return NextResponse.json({ messages })
  } catch (err) {
    console.error('Thread fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch thread' }, { status: 500 })
  }
}
