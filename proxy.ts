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
    // frame-src: 'self' + blob:/data: for embedded CV PDF previews,
    // plus Stripe Checkout/Elements iframes.
    `frame-src 'self' blob: data: https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com`,
    `worker-src 'self' blob:`,
    // object-src covers <object>/<embed> PDF fallbacks on some browsers
    `object-src 'self' blob: data:`,
    `base-uri 'self'`,
    `form-action 'self' https://checkout.stripe.com`,
    `frame-ancestors 'none'`,
    ...(isDev ? [] : [`upgrade-insecure-requests`]),
  ].join('; ')
}

// NextAuth `auth` wraps a handler and exposes the session on req.auth.
// We use it here as the Next.js proxy (formerly middleware).
//
// CSP nonce plumbing: with 'strict-dynamic', host-based allowlisting ('self')
// is ignored — every script tag must carry a nonce. Next.js auto-attaches the
// nonce to its chunks *only if* it can read `x-nonce` off the REQUEST headers
// via `headers()`. That's why we have to pass the nonce through
// NextResponse.next({ request: { headers } }) — setting it on the response
// alone makes the browser enforce CSP while Next.js still renders un-nonced
// tags, blocking the whole client bundle.
export const proxy = auth((req) => {
  const pathname = req.nextUrl.pathname
  const skipCsp =
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico'

  if (skipCsp) {
    return NextResponse.next()
  }

  const nonce = generateNonce()
  const csp = buildCsp(nonce)

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)

  const res = NextResponse.next({
    request: { headers: requestHeaders },
  })
  res.headers.set('Content-Security-Policy', csp)
  res.headers.set('X-Nonce', nonce)
  return res
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
}
