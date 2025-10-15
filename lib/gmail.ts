import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'

function toHtml(text: string): string {
  // HTML-escape before wrapping to avoid injection via email body.
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  return escaped
    .split(/\n\n+/)
    .map(para => `<p style="margin:0 0 14px 0;line-height:1.6;">${para.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

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
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
    ],
    prompt: 'consent',
    ...(campaignId ? { state: campaignId } : {}),
  })
}

interface GmailTokens {
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

interface SendEmailParams {
  from?: string
  to: string
  subject: string
  body: string
  accessToken: string
  cvPdfBase64?: string
  cvFileName?: string
  emailId?: string
  threadId?: string
  inReplyTo?: string
  references?: string
}

function injectTrackingPixel(html: string, emailId?: string): string {
  if (!emailId) return html
  const baseUrl = process.env.NEXTAUTH_URL ?? ''
  // Only inject pixel for public URLs — localhost tracking triggers spam filters
  if (!baseUrl || baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) return html
  const pixel = `<img src="${baseUrl}/api/track/open?id=${emailId}" width="1" height="1" style="display:none" alt="" />`
  return html + pixel
}

function toBase64Url(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function chunk76(base64: string): string {
  return base64.match(/.{1,76}/g)?.join('\r\n') ?? base64
}

function buildAlternativeBody(plainText: string, html: string): string {
  const altBoundary = `alt_${Date.now()}`
  return [
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    `--${altBoundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    chunk76(Buffer.from(plainText).toString('base64')),
    '',
    `--${altBoundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    chunk76(Buffer.from(html).toString('base64')),
    '',
    `--${altBoundary}--`,
  ].join('\r\n')
}

function buildRawEmail(params: SendEmailParams): string {
  const { from, to, subject, body, cvPdfBase64, cvFileName, emailId, inReplyTo, references } = params

  const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@autoapply>`

  // Standard headers — From, Date, Message-ID are critical for deliverability
  const headers = [
    ...(from ? [`From: ${from}`] : []),
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId}`,
    'MIME-Version: 1.0',
  ]
  if (inReplyTo) headers.push(`In-Reply-To: <${inReplyTo}>`)
  if (references) headers.push(`References: <${references}>`)

  const htmlContent = injectTrackingPixel(toHtml(body), emailId)
  const plainText = body

  if (!cvPdfBase64) {
    // multipart/alternative: text/plain + text/html
    const raw = [
      ...headers,
      buildAlternativeBody(plainText, htmlContent),
    ].join('\r\n')
    return toBase64Url(raw)
  }

  // multipart/mixed: (multipart/alternative body) + PDF attachment
  const mixedBoundary = `mixed_${Date.now()}`
  const fileName = cvFileName ?? 'CV.pdf'
  const pdfChunked = chunk76(cvPdfBase64)

  const raw = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    '',
    `--${mixedBoundary}`,
    buildAlternativeBody(plainText, htmlContent),
    '',
    `--${mixedBoundary}`,
    `Content-Type: application/pdf; name="${fileName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${fileName}"`,
    '',
    pdfChunked,
    '',
    `--${mixedBoundary}--`,
  ].join('\r\n')

  return toBase64Url(raw)
}

export async function sendGmailEmail(params: SendEmailParams): Promise<{ messageId: string; threadId: string }> {
  const oauth2Client = getOAuth2Client()
  oauth2Client.setCredentials({ access_token: params.accessToken })

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

  const raw = buildRawEmail(params)

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, threadId: params.threadId },
  })

  return {
    messageId: result.data.id ?? '',
    threadId: result.data.threadId ?? '',
  }
}

export async function getThreadMessages(accessToken: string, threadId: string) {
  const oauth2Client = getOAuth2Client()
  oauth2Client.setCredentials({ access_token: accessToken })
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
  const thread = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' })
  return thread.data.messages ?? []
}

interface ThreadMessage {
  id: string
  from: string
  to: string
  subject: string
  date: string
  bodyHtml: string | null
  bodyText: string | null
  messageId: string | null
  isFromUser: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findBodyPart(payload: any, mimeType: string): string | null {
  if (!payload) return null
  if (payload.mimeType === mimeType && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8')
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const found = findBodyPart(part, mimeType)
      if (found) return found
    }
  }
  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getHeader(headers: any[], name: string): string {
  return headers?.find((h: { name?: string }) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseThreadMessages(messages: any[], userEmail: string): ThreadMessage[] {
  return messages.map((msg) => {
    const headers = msg.payload?.headers ?? []
    const from = getHeader(headers, 'From')
    const bodyHtml = findBodyPart(msg.payload, 'text/html')
    const bodyText = findBodyPart(msg.payload, 'text/plain')

    return {
      id: msg.id ?? '',
      from,
      to: getHeader(headers, 'To'),
      subject: getHeader(headers, 'Subject'),
      date: getHeader(headers, 'Date'),
      bodyHtml,
      bodyText,
      messageId: getHeader(headers, 'Message-ID') || getHeader(headers, 'Message-Id'),
      isFromUser: from.toLowerCase().includes(userEmail.toLowerCase()),
    }
  })
}

async function getValidAccessToken(stored: {
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
