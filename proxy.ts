import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'
import { authConfig } from './auth.config'

const { auth } = NextAuth(authConfig)

function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== 'production'
  // React/Next require eval in dev for HMR + source-mapped stack reconstruction.
  // In production we use strict-dynamic with nonce only.
  const scriptSrc = isDev
    ? `script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://*.posthog.com https://*.sentry-cdn.com`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com https://*.posthog.com https://*.sentry-cdn.com`

  return [
    `default-src 'self'`,
    scriptSrc,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `img-src 'self' blob: data: https://*.mapbox.com https://api.mapbox.com https://*.googleusercontent.com https://*.gravatar.com`,
    `font-src 'self' data: https://fonts.gstatic.com`,
    `connect-src 'self' ws: wss: https://*.mapbox.com https://api.mapbox.com https://events.mapbox.com https://api.stripe.com https://*.posthog.com https://*.sentry.io https://api.anthropic.com`,
    `frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self' https://checkout.stripe.com`,
    `frame-ancestors 'none'`,
    ...(isDev ? [] : [`upgrade-insecure-requests`]),
  ].join('; ')
}

// NextAuth `auth` wraps a handler and exposes the session on req.auth.
// We use it here as the Next.js proxy (formerly middleware).
export const proxy = auth((req) => {
  const pathname = req.nextUrl.pathname
  const skipCsp =
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico'

  const res = NextResponse.next()
  if (!skipCsp) {
    const nonce = generateNonce()
    res.headers.set('Content-Security-Policy', buildCsp(nonce))
    res.headers.set('X-Nonce', nonce)
  }
  return res
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
}
