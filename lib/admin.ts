/**
 * Admin auth. Simple allowlist by email via the `ADMIN_EMAILS` env var
 * (comma-separated). Keeps auth out of the DB so adding/removing admins
 * doesn't require a migration — just a deploy.
 *
 * For the pure email-allowlist check (no auth dependency, safe for client
 * code), use `lib/admin-emails.ts`. This file pulls in `auth()` for
 * server-only session checks.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { isAdminEmail } from './admin-emails'

/**
 * Gate a server route/component on admin status. Returns the session user
 * on success; throws with a 401/403-style error message otherwise.
 */
export async function requireAdmin(): Promise<{ id: string; email: string }> {
  const session = await auth()
  const email = session?.user?.email
  const id = session?.user?.id
  if (!id || !email) throw new Error('Unauthorized')
  if (!isAdminEmail(email)) throw new Error('Forbidden')
  return { id, email }
}

/**
 * Wrap an admin-only route handler. Translates the requireAdmin throws into
 * 401/403 responses so individual handlers don't repeat the try/catch.
 */
export function withAdmin<R>(
  handler: (user: { id: string; email: string }) => Promise<R>,
): () => Promise<R | NextResponse> {
  return async () => {
    let user: { id: string; email: string }
    try {
      user = await requireAdmin()
    } catch (err) {
      const status = err instanceof Error && err.message === 'Forbidden' ? 403 : 401
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Unauthorized' }, { status })
    }
    return handler(user)
  }
}
