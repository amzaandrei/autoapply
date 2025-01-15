import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getOAuth2Client, getGmailAuthUrl } from '@/lib/gmail'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', process.env.NEXTAUTH_URL ?? 'http://localhost:3000'))
  }

  const oauth2Client = getOAuth2Client()
  const authUrl = getGmailAuthUrl(oauth2Client)

  return NextResponse.redirect(authUrl)
}
