/**
 * Admin auth. Simple allowlist by email via the `ADMIN_EMAILS` env var
 * (comma-separated). Keeps auth out of the DB so adding/removing admins
 * doesn't require a migration — just a deploy.
 *
 * Safe to import from client components (only exports a pure function).
 * For server-only session checks, use `requireAdmin()`.
 */
import { auth } from '@/auth'

function adminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? ''
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return adminEmails().has(email.toLowerCase())
}

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
