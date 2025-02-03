import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'

export function getOAuth2Client(): OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI ?? `${process.env.NEXTAUTH_URL}/api/gmail/callback`
  )
}

export function getGmailAuthUrl(oauth2Client: OAuth2Client, campaignId?: string): string {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.send'],
    prompt: 'consent',
    ...(campaignId ? { state: campaignId } : {}),
  })
}

export interface GmailTokens {
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
}

export async function exchangeCode(code: string): Promise<GmailTokens> {
  const oauth2Client = getOAuth2Client()
  const { tokens } = await oauth2Client.getToken(code)

  return {
    accessToken: tokens.access_token ?? '',
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<GmailTokens> {
  const oauth2Client = getOAuth2Client()
  oauth2Client.setCredentials({ refresh_token: refreshToken })
  const { credentials } = await oauth2Client.refreshAccessToken()

  return {
    accessToken: credentials.access_token ?? '',
    refreshToken: credentials.refresh_token ?? refreshToken,
    expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
  }
}

export interface SendEmailParams {
  to: string
  subject: string
  body: string
  accessToken: string
}

export async function sendGmailEmail(params: SendEmailParams): Promise<string> {
  const oauth2Client = getOAuth2Client()
  oauth2Client.setCredentials({ access_token: params.accessToken })

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

  const messageParts = [
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    params.body,
  ]

  const raw = Buffer.from(messageParts.join('\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  })

  return result.data.id ?? ''
}

export async function getValidAccessToken(stored: {
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
}): Promise<string> {
  const isExpired = stored.expiresAt && new Date() > new Date(stored.expiresAt.getTime() - 60_000)
  if (!isExpired) return stored.accessToken
  if (!stored.refreshToken) throw new Error('Gmail token expired and no refresh token available')
  const refreshed = await refreshAccessToken(stored.refreshToken)
  return refreshed.accessToken
}
