import type { NextAuthConfig } from 'next-auth'

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isOnLogin = nextUrl.pathname === '/login'
      const isOnSignup = nextUrl.pathname === '/signup'
      const isOnAuth = nextUrl.pathname.startsWith('/api/auth')

      if (isOnAuth) return true
      if (isOnLogin || isOnSignup) {
        if (isLoggedIn) return Response.redirect(new URL('/dashboard', nextUrl))
        return true
      }
      if (!isLoggedIn) {
        const callbackUrl = encodeURIComponent(nextUrl.pathname + nextUrl.search)
        return Response.redirect(new URL(`/login?callbackUrl=${callbackUrl}`, nextUrl))
      }
      return true
    },
  },
}
