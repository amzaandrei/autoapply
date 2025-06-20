import { resolveMx } from 'dns/promises'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Cache MX lookups per process to avoid repeat DNS calls
const mxCache = new Map<string, { valid: boolean; checkedAt: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

// Common disposable/invalid domains to reject outright
const BLOCKED_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'test.org',
  'localhost',
  'invalid.com',
])

export interface ValidationResult {
  email: string
  valid: boolean
  reason?: string
}

export async function validateEmail(email: string): Promise<ValidationResult> {
  if (!email) return { email, valid: false, reason: 'empty' }

  const trimmed = email.trim().toLowerCase()

  // 1. Syntactic check
  if (!EMAIL_REGEX.test(trimmed)) {
    return { email, valid: false, reason: 'invalid format' }
  }

  const domain = trimmed.split('@')[1]

  // 2. Blocked domains
  if (BLOCKED_DOMAINS.has(domain)) {
    return { email, valid: false, reason: 'placeholder domain' }
  }

  // 3. MX record check (cached)
  const cached = mxCache.get(domain)
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL) {
    return { email, valid: cached.valid, reason: cached.valid ? undefined : 'no mail servers' }
  }

  try {
    const mxRecords = await resolveMx(domain)
    const valid = mxRecords.length > 0
    mxCache.set(domain, { valid, checkedAt: Date.now() })
    return { email, valid, reason: valid ? undefined : 'no mail servers' }
  } catch {
    mxCache.set(domain, { valid: false, checkedAt: Date.now() })
    return { email, valid: false, reason: 'domain not found' }
  }
}

// Validate multiple emails in parallel
export async function validateEmails(emails: string[]): Promise<ValidationResult[]> {
  return Promise.all(emails.map(validateEmail))
}
