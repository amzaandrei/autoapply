import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getOAuth2Client, getGmailAuthUrl } from '@/lib/gmail'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', process.env.NEXTAUTH_URL ?? 'http://localhost:3000'))
  }

  const campaignId = request.nextUrl.searchParams.get('campaignId') ?? undefined
  const oauth2Client = getOAuth2Client()
  const authUrl = getGmailAuthUrl(oauth2Client, campaignId)

  return NextResponse.redirect(authUrl)
}
