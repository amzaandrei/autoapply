import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getOAuth2Client } from '@/lib/gmail'
import { resolveGmailAccessToken } from '@/lib/gmail-token'
import { withAuthNoReq } from '@/lib/api-auth'
import { google } from 'googleapis'
import { anthropic as ai } from '@/lib/anthropic'

interface CalendarEvent {
  companyName: string
  contactEmail: string
  type: string
  date: string | null
  time: string | null
  location: string | null
  notes: string | null
  raw: string
}

export const POST = withAuthNoReq(async ({ userId }) => {
  try {
    const tokenResult = await resolveGmailAccessToken(userId)
    if (!tokenResult.ok) return tokenResult.response
    const { accessToken } = tokenResult

    const oauth2Client = getOAuth2Client()
    oauth2Client.setCredentials({ access_token: accessToken })
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Get replied emails to check their threads for interview invites
    const repliedEmails = await prisma.generatedEmail.findMany({
      where: { campaign: { userId: userId }, status: 'REPLIED', gmailThreadId: { not: null } },
      include: { company: { select: { name: true, contactEmail: true } } },
      take: 20,
    })

    const events: CalendarEvent[] = []

    for (const email of repliedEmails) {
      if (!email.gmailThreadId) continue
      try {
        const thread = await gmail.users.threads.get({ userId: 'me', id: email.gmailThreadId, format: 'full' })
        const messages = thread.data.messages ?? []

        // Get the latest reply content from the company
        const userEmail = (await prisma.user.findUnique({ where: { id: userId }, select: { email: true } }))?.email?.toLowerCase() ?? ''
        const companyReplies = messages.filter((msg) => {
          const from = msg.payload?.headers?.find((h) => h.name?.toLowerCase() === 'from')?.value?.toLowerCase() ?? ''
          return !from.includes(userEmail)
        })

        if (companyReplies.length === 0) continue

        const latestReply = companyReplies[companyReplies.length - 1]
        // Extract body
        let bodyText = ''
        const extractText = (payload: typeof latestReply.payload): string => {
          if (payload?.mimeType === 'text/plain' && payload.body?.data) {
            return Buffer.from(payload.body.data, 'base64url').toString('utf-8')
          }
          if (payload?.parts) {
            for (const part of payload.parts) {
              const found = extractText(part as typeof payload)
              if (found) return found
            }
          }
          return ''
        }
        bodyText = extractText(latestReply.payload ?? undefined)
        if (!bodyText) continue

        // Use AI to check if this reply contains an interview/meeting invite
        const aiResponse = await ai.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 512,
          system: 'Analyze email replies to determine if they contain interview invitations, meeting requests, or scheduling proposals. Return ONLY valid JSON.',
          messages: [{
            role: 'user',
            content: `Does this email reply contain an interview invitation or meeting request?\n\nFrom: ${email.company.name}\nBody: ${bodyText.slice(0, 1000)}\n\nReturn JSON: { "hasInterview": true/false, "type": "phone_screen|technical|onsite|meeting|null", "date": "YYYY-MM-DD or null", "time": "HH:MM or null", "location": "string or null", "notes": "brief description or null" }`,
          }],
        }, { langsmithExtra: { name: 'detectInterviewInReply', metadata: { userId } } })

        const aiText = aiResponse.content.find((b) => b.type === 'text')?.text ?? ''
        const jsonStr = aiText.startsWith('{') ? aiText : aiText.match(/\{[\s\S]*\}/)?.[0] ?? '{}'
        const parsed = JSON.parse(jsonStr) as { hasInterview?: boolean; type?: string; date?: string; time?: string; location?: string; notes?: string }

        if (parsed.hasInterview) {
          events.push({
            companyName: email.company.name,
            contactEmail: email.company.contactEmail ?? '',
            type: parsed.type ?? 'meeting',
            date: parsed.date ?? null,
            time: parsed.time ?? null,
            location: parsed.location ?? null,
            notes: parsed.notes ?? null,
            raw: bodyText.slice(0, 200),
          })
        }
      } catch {
        // Skip on error, continue to next
      }
    }

    return NextResponse.json({ events, checked: repliedEmails.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
})
