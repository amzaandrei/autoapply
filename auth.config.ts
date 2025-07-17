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
      const path = nextUrl.pathname

      // Always-public routes
      const publicPaths = ['/', '/pricing']
      const isPublic = publicPaths.includes(path)
      const isOnLogin = path === '/login'
      const isOnSignup = path === '/signup'
      const isOnAuth = path.startsWith('/api/auth')
      // Public API routes the app itself hits without a session
      const isPublicApi =
        path.startsWith('/api/stripe/webhook') ||
        path.startsWith('/api/health') ||
        path.startsWith('/api/track/open')

      if (isOnAuth || isPublic || isPublicApi) return true
      if (isOnLogin || isOnSignup) {
        if (isLoggedIn) return Response.redirect(new URL('/dashboard', nextUrl))
        return true
      }
      if (!isLoggedIn) {
        const callbackUrl = encodeURIComponent(path + nextUrl.search)
        return Response.redirect(new URL(`/login?callbackUrl=${callbackUrl}`, nextUrl))
      }
      return true
    },
  },
}
