/**
 * Extract the originating client IP from request headers.
 *
 * Behind the Caddy reverse proxy the real client IP is the first hop of
 * `x-forwarded-for`; fall back to `x-real-ip`, then a fixed `unknown` sentinel
 * so callers (e.g. rate-limit keys) never collapse to `undefined`. Accepts a
 * possibly-absent Headers so both route handlers (`req.headers`) and the
 * NextAuth credentials `authorize(_, request)` (where `request` may be
 * undefined) can share one implementation.
 */
export function getClientIp(headers: Headers | null | undefined): string {
  const xff = headers?.get('x-forwarded-for')
  return xff?.split(',')[0]?.trim() || headers?.get('x-real-ip') || 'unknown'
}
