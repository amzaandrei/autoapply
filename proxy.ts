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
  //
  // Production note: we intentionally do NOT use 'strict-dynamic' + 'nonce-X'
  // here. strict-dynamic requires every script tag (Next's auto-emitted chunks
  // + inline bootstraps) to carry a matching nonce. Next.js only attaches the
  // nonce at render time in a *dynamically rendered* layout; any statically
  // rendered page (e.g. /, /pricing) emits un-nonced tags and gets fully
  // blocked. Forcing every layout to `await headers()` fixes the CSP but kills
  // static caching — a bad trade for a marketing site. Instead we fall back
  // to 'self' + 'unsafe-inline' + explicit host allowlist: external script
  // injection is still blocked by 'self' and frame-ancestors 'none' prevents
  // clickjacking. Tighten to strict-dynamic once a real domain is in place
  // and static pages are moved behind a dynamic boundary.
  // The nonce is still generated and threaded through to style-src and for
  // future inline-script use; it's just not required by script-src anymore.
  const scriptSrc = isDev
    ? `script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://*.posthog.com https://*.sentry-cdn.com`
    : `script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.posthog.com https://*.sentry-cdn.com`

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
// Nonce plumbing is kept even though script-src doesn't currently require a
// matching nonce (see buildCsp comment). The nonce is forwarded through
// NextResponse.next({ request: { headers } }) so that if/when we tighten CSP
// back to 'strict-dynamic', Next.js can already see x-nonce on the request
// and attach it to its auto-emitted <script> tags — no middleware rewrite
// needed. For now it's a no-op that keeps the tightening path cheap.
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
