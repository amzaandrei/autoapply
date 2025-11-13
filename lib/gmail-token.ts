import type { GeneratedEmail } from '@prisma/client'
import { NextResponse } from 'next/server'
import { prisma } from './prisma'
import { refreshAccessToken, GmailReauthRequiredError } from './gmail'

export class GmailNotConnectedError extends Error {
  constructor() {
    super('Gmail not connected')
    this.name = 'GmailNotConnectedError'
  }
}

export class ThreadNotFoundError extends Error {
  constructor() {
    super('Thread not found')
    this.name = 'ThreadNotFoundError'
  }
}

/**
 * Look up a user-owned generated email by Gmail thread ID and grab a fresh
 * access token in one shot. Routes that operate on an existing thread reuse
 * this so the (lookup → 404) + (token → 400) pattern doesn't get copy-pasted.
 */
export async function getOwnedThreadAndToken(
  threadId: string,
  userId: string,
): Promise<{ email: GeneratedEmail; accessToken: string }> {
  const email = await prisma.generatedEmail.findFirst({
    where: { gmailThreadId: threadId, campaign: { userId } },
  })
  if (!email) throw new ThreadNotFoundError()

  const accessToken = await getGmailAccessTokenForUser(userId)
  return { email, accessToken }
}

type AccessTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; response: NextResponse }

/**
 * Resolves a fresh Gmail access token for the user. Routes that talk to Gmail
 * but don't need a thread lookup use this so the `not connected` 400 isn't
 * copy-pasted between calendar/check-replies-style routes.
 */
export async function resolveGmailAccessToken(userId: string): Promise<AccessTokenResult> {
  try {
    return { ok: true, accessToken: await getGmailAccessTokenForUser(userId) }
  } catch (err) {
    if (err instanceof GmailNotConnectedError) {
      return { ok: false, response: NextResponse.json({ error: 'Gmail not connected' }, { status: 400 }) }
    }
    throw err
  }
}

type OwnedThreadResult =
  | { ok: true; email: GeneratedEmail; accessToken: string }
  | { ok: false; response: NextResponse }

/**
 * Wrapper around getOwnedThreadAndToken that translates the typed errors into
 * the standard 404/400 NextResponse so route handlers don't repeat the
 * instanceof boilerplate. Other errors propagate.
 */
export async function resolveOwnedThread(
  threadId: string,
  userId: string,
): Promise<OwnedThreadResult> {
  try {
    return { ok: true, ...(await getOwnedThreadAndToken(threadId, userId)) }
  } catch (err) {
    if (err instanceof ThreadNotFoundError) {
      return { ok: false, response: NextResponse.json({ error: err.message }, { status: 404 }) }
    }
    if (err instanceof GmailNotConnectedError) {
      return { ok: false, response: NextResponse.json({ error: err.message }, { status: 400 }) }
    }
    if (err instanceof GmailReauthRequiredError) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Gmail access has been revoked. Reconnect your Gmail account to continue.', needsReconnect: true },
          { status: 401 }
        ),
      }
    }
    throw err
  }
}

/**
 * Returns a fresh access token for the user, refreshing it if expired. Throws
 * GmailNotConnectedError if the user hasn't connected Gmail.
 */
export async function getGmailAccessTokenForUser(userId: string): Promise<string> {
  const gmailToken = await prisma.gmailToken.findUnique({ where: { userId } })
  if (!gmailToken) throw new GmailNotConnectedError()

  const isExpired =
    gmailToken.expiresAt && new Date() > new Date(gmailToken.expiresAt.getTime() - 60_000)
  if (!isExpired || !gmailToken.refreshToken) return gmailToken.accessToken

  try {
    const refreshed = await refreshAccessToken(gmailToken.refreshToken)
    await prisma.gmailToken.update({
      where: { userId },
      data: {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken ?? gmailToken.refreshToken,
        expiresAt: refreshed.expiresAt,
      },
    })
    return refreshed.accessToken
  } catch (err) {
    if (err instanceof GmailReauthRequiredError) {
      await prisma.gmailToken.deleteMany({ where: { userId } })
    }
    throw err
  }
}
