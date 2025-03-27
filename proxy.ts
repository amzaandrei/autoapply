import NextAuth from 'next-auth'
import { authConfig } from './auth.config'

const { auth } = NextAuth(authConfig)

export async function proxy(request: Parameters<typeof auth>[0]) {
  return auth(request as Parameters<typeof auth>[0])
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
}
