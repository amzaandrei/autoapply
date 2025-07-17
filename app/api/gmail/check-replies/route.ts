import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { refreshAccessToken, getOAuth2Client } from '@/lib/gmail'
import { sendTelegramNotification, formatReplyNotification } from '@/lib/notifications'
import { invalidateAppliedCache } from '@/server/routers/regions'
import { google } from 'googleapis'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const gmailToken = await prisma.gmailToken.findUnique({
      where: { userId: session.user.id },
    })
    if (!gmailToken) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 })
    }

    let accessToken = gmailToken.accessToken
    const expiresAt = gmailToken.expiresAt ? new Date(gmailToken.expiresAt).getTime() : 0
    const isExpired = expiresAt > 0 && Date.now() > expiresAt - 60_000
    if (isExpired) {
      if (!gmailToken.refreshToken) {
        return NextResponse.json({ error: 'Gmail token expired. Please reconnect Gmail.' }, { status: 401 })
      }
      try {
        const refreshed = await refreshAccessToken(gmailToken.refreshToken)
        accessToken = refreshed.accessToken
        await prisma.gmailToken.update({
          where: { userId: session.user.id },
          data: {
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken ?? gmailToken.refreshToken,
            expiresAt: refreshed.expiresAt,
          },
        })
      } catch (refreshErr) {
        console.error('Token refresh failed:', refreshErr)
        return NextResponse.json({ error: 'Failed to refresh Gmail token. Please reconnect Gmail.' }, { status: 401 })
      }
    }

    const oauth2Client = getOAuth2Client()
    oauth2Client.setCredentials({ access_token: accessToken })
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true },
    })
    const userEmail = user?.email?.toLowerCase() ?? ''

    // Get all SENT/OPENED emails that haven't been replied to
    const emails = await prisma.generatedEmail.findMany({
      where: {
        campaign: { userId: session.user.id },
        status: { in: ['SENT', 'OPENED'] },
        repliedAt: null,
      },
      select: { id: true, gmailThreadId: true, gmailMessageId: true, companyId: true, subject: true, company: { select: { id: true, name: true, contactEmail: true } } },
    })

    let repliesFound = 0
    let bouncesFound = 0
    const results: Array<{ emailId: string; replied: boolean; error?: string }> = []

    for (const email of emails) {
      try {
        const contactEmail = email.company.contactEmail
        if (!contactEmail) {
          results.push({ emailId: email.id, replied: false })
          continue
        }

        // Strategy 0: Check for bounce first — bounces should never be classified as replies
        let bounced = false
        let foundReply = false

        if (email.gmailThreadId) {
          try {
            const thread = await gmail.users.threads.get({
              userId: 'me',
              id: email.gmailThreadId,
              format: 'metadata',
              metadataHeaders: ['From', 'Subject'],
            })
            const messages = thread.data.messages ?? []
            // Detect bounce messages first
            bounced = messages.some((msg) => {
              const from = msg.payload?.headers?.find((h) => h.name?.toLowerCase() === 'from')?.value?.toLowerCase() ?? ''
              const subject = msg.payload?.headers?.find((h) => h.name?.toLowerCase() === 'subject')?.value?.toLowerCase() ?? ''
              return from.includes('mailer-daemon') || from.includes('postmaster') ||
                subject.includes('delivery status') || subject.includes('undeliverable') ||
                subject.includes('delivery failed') || subject.includes('returned mail') ||
                subject.includes('address not found') || subject.includes("wasn't delivered")
            })
            // Only look for real replies if not bounced
            if (!bounced) {
              foundReply = messages.some((msg) => {
              const from = msg.payload?.headers?.find((h) => h.name?.toLowerCase() === 'from')?.value?.toLowerCase() ?? ''
              const subject = msg.payload?.headers?.find((h) => h.name?.toLowerCase() === 'subject')?.value?.toLowerCase() ?? ''
              // No From header = can't determine sender, skip
              if (!from) return false
              // From the user = not a reply
              if (from.includes(userEmail)) return false
              // From mailer-daemon/postmaster = bounce, NOT a reply
              if (from.includes('mailer-daemon') || from.includes('postmaster')) return false
              // Subject looks like a bounce notification = NOT a reply
              if (subject.includes('delivery status') || subject.includes('undeliverable') ||
                  subject.includes('delivery failed') || subject.includes('returned mail') ||
                  subject.includes('address not found') || subject.includes("wasn't delivered")) return false
              // From someone else = real reply
              return true
              })
            }
          } catch (threadErr) {
            console.error('Thread check failed for', email.gmailThreadId, threadErr)
            // Fall through to strategy 2
          }
        }

        // Strategy 2: Search Gmail for replies from this contact (only in same thread or referencing our subject)
        if (!foundReply && email.gmailMessageId) {
          try {
            // Search for messages from this contact that reference our email's subject
            const subjectQuery = email.subject ? `subject:"Re: ${email.subject.replace(/"/g, '')}"` : ''
            const query = `from:${contactEmail} ${subjectQuery} newer_than:14d`
            const search = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 1 })
            if (search.data.messages && search.data.messages.length > 0) {
              foundReply = true

              if (!email.gmailThreadId && search.data.messages[0].threadId) {
                await prisma.generatedEmail.update({
                  where: { id: email.id },
                  data: { gmailThreadId: search.data.messages[0].threadId },
                })
              }
            }
          } catch (searchErr) {
            console.error('Search check failed for', contactEmail, searchErr)
          }
        }

        if (bounced) {
          await prisma.generatedEmail.update({
            where: { id: email.id },
            data: { status: 'BOUNCED' },
          })
          bouncesFound++
          results.push({ emailId: email.id, replied: false, error: 'Email bounced' })
        } else if (foundReply) {
          await prisma.generatedEmail.update({
            where: { id: email.id },
            data: { repliedAt: new Date(), status: 'REPLIED' },
          })
          await prisma.company.update({
            where: { id: email.company.id },
            data: { status: 'REPLIED' },
          })
          repliesFound++
          results.push({ emailId: email.id, replied: true })
          void sendTelegramNotification(formatReplyNotification(email.company.name ?? 'Unknown', contactEmail))
        } else {
          results.push({ emailId: email.id, replied: false })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Check failed'
        if (message.includes('Insufficient Permission') || message.includes('403')) {
          return NextResponse.json({
            error: 'Gmail permissions insufficient. Please reconnect Gmail.',
            needsReconnect: true,
            checked: 0,
            repliesFound: 0,
            results: [],
          }, { status: 403 })
        }
        results.push({ emailId: email.id, replied: false, error: message })
      }
    }

    if (repliesFound > 0 || bouncesFound > 0) invalidateAppliedCache(session.user.id)

    return NextResponse.json({ checked: emails.length, repliesFound, bouncesFound, results })
  } catch (err) {
    console.error('Check replies error:', err)
    const message = err instanceof Error ? err.message : 'Failed to check replies'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
