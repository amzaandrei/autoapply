import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { exchangeCode } from '@/lib/gmail'

export async function GET(request: NextRequest) {
  const session = await auth()
  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'

  if (!session?.user?.id) {
    return NextResponse.redirect(`${baseUrl}/login`)
  }

  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(`${baseUrl}/send?gmailError=${encodeURIComponent(error)}`)
  }

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/send?gmailError=no_code`)
  }

  try {
    const tokens = await exchangeCode(code)

    await prisma.gmailToken.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        scope: 'https://www.googleapis.com/auth/gmail.send',
      },
      update: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? undefined,
        expiresAt: tokens.expiresAt,
      },
    })

    // Get the campaignId from the state param if passed
    const campaignId = searchParams.get('state')
    const redirectPath = campaignId ? `/send?campaignId=${campaignId}&gmailConnected=1` : '/send?gmailConnected=1'
    return NextResponse.redirect(`${baseUrl}${redirectPath}`)
  } catch (err) {
    console.error('Gmail callback error:', err)
    const message = err instanceof Error ? err.message : 'OAuth failed'
    return NextResponse.redirect(`${baseUrl}/send?gmailError=${encodeURIComponent(message)}`)
  }
}
