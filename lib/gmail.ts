import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'

function toHtml(text: string): string {
  return text
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
  cvPdfBase64?: string
  cvFileName?: string
}

function toBase64Url(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function buildRawEmail(params: SendEmailParams): string {
  const { to, subject, body, cvPdfBase64, cvFileName } = params

  if (!cvPdfBase64) {
    // HTML email without attachment — convert plain text to HTML then base64 encode
    const htmlContent = toHtml(body)
    const htmlBase64 = Buffer.from(htmlContent).toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? Buffer.from(htmlContent).toString('base64')
    const messageParts = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      htmlBase64,
    ]
    return toBase64Url(messageParts.join('\r\n'))
  }

  // Multipart MIME email with PDF attachment
  const boundary = `AutoApply_boundary_${Date.now()}`
  const fileName = cvFileName ?? 'CV.pdf'

  const bodyBase64 = Buffer.from(toHtml(body)).toString('base64')
  // chunk the base64 attachment into 76-char lines (RFC 2045)
  const pdfChunked = cvPdfBase64.match(/.{1,76}/g)?.join('\r\n') ?? cvPdfBase64

  const raw = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    bodyBase64,
    '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="${fileName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${fileName}"`,
    '',
    pdfChunked,
    '',
    `--${boundary}--`,
  ].join('\r\n')

  return toBase64Url(raw)
}

export async function sendGmailEmail(params: SendEmailParams): Promise<string> {
  const oauth2Client = getOAuth2Client()
  oauth2Client.setCredentials({ access_token: params.accessToken })

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

  const raw = buildRawEmail(params)

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
