import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendTelegramNotification, formatOpenNotification } from '@/lib/notifications'

// 1x1 transparent GIF
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

const HEADERS = {
  'Content-Type': 'image/gif',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')

  if (id) {
    try {
      const email = await prisma.generatedEmail.findUnique({
        where: { id },
        select: { status: true, openedAt: true, company: { select: { name: true } } },
      })
      if (email) {
        await prisma.generatedEmail.update({
          where: { id },
          data: {
            openCount: { increment: 1 },
            ...(email.openedAt ? {} : { openedAt: new Date() }),
            ...(email.status === 'SENT' ? { status: 'OPENED' } : {}),
          },
        })
        // Notify on first open only
        if (!email.openedAt) {
          void sendTelegramNotification(formatOpenNotification(email.company.name))
        }
      }
    } catch {
      // Silent fail — always return pixel
    }
  }

  return new NextResponse(PIXEL, { headers: HEADERS })
}
