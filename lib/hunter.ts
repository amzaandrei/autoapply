// Hunter.io integration for finding + verifying company contact emails.
// Free tier: 25 requests/month. Set HUNTER_API_KEY in .env.local.
// Docs: https://hunter.io/api-documentation/v2

import { incrementUsage } from './entitlements'

const HUNTER_API_KEY = process.env.HUNTER_API_KEY ?? ''
const BASE = 'https://api.hunter.io/v2'

export function hasHunter(): boolean {
  return HUNTER_API_KEY.length > 0
}

// Per-user usage tracking — only increments when a userId is passed so
// callers without user context (e.g. cron jobs) don't crash. Failures to
// record are swallowed: the Hunter call already succeeded, we don't want
// a counter write to break the request.
async function recordHunterRequest(userId: string | null | undefined): Promise<void> {
  if (!userId) return
  try {
    await incrementUsage(userId, 'hunter_request', 1)
  } catch (err) {
    console.warn('Failed to record hunter_request usage:', err)
  }
}

export interface HunterEmail {
  value: string
  type: 'personal' | 'generic'
  confidence: number
  department?: string
  position?: string
  first_name?: string
  last_name?: string
}

export interface HunterDomainResult {
  domain: string | null
  organization: string | null
  emails: HunterEmail[]
}

/**
 * Search Hunter.io for all known emails at a company.
 * Accepts either a domain or a company name — Hunter resolves the company to a
 * domain server-side when we pass `company=`, which means we can skip the AI
 * web-search fallback for companies that exist in Hunter's database.
 * Prioritizes generic hiring emails (careers@, jobs@, hr@) if present.
 */
export async function hunterDomainSearch(input: {
  domain?: string | null
  companyName?: string | null
  userId?: string | null
}): Promise<HunterDomainResult | null> {
  if (!HUNTER_API_KEY) return null

  const domain = input.domain?.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  const company = input.companyName?.trim()
  if (!domain && !company) return null

  try {
    const params = new URLSearchParams({
      api_key: HUNTER_API_KEY,
      department: 'hr',
      limit: '10',
    })
    if (domain) params.set('domain', domain)
    else if (company) params.set('company', company)

    const res = await fetch(`${BASE}/domain-search?${params.toString()}`)
    // Every request that hits Hunter counts against quota, even 404s
    await recordHunterRequest(input.userId)
    if (!res.ok) {
      if (res.status === 400 || res.status === 404) return null
      console.warn('Hunter.io error:', res.status)
      return null
    }
    const data = await res.json() as { data?: { domain?: string; organization?: string; emails?: HunterEmail[] } }
    if (!data.data) return null

    return {
      domain: data.data.domain ?? null,
      organization: data.data.organization ?? null,
      emails: data.data.emails ?? [],
    }
  } catch (err) {
    console.warn('Hunter fetch failed:', err)
    return null
  }
}

/**
 * Find the best hiring/careers email for a company via Hunter.io.
 * Pass the domain if you have it — Hunter's hit-rate is much higher that way.
 * Otherwise the company name is used as a fallback. Returns null if no key set
 * or nothing found (caller should then fall back to AI web search).
 */
export async function hunterFindHiringEmail(input: {
  domain?: string | null
  companyName?: string | null
  userId?: string | null
}): Promise<{ email: string; domain: string | null } | null> {
  const result = await hunterDomainSearch(input)
  if (!result || result.emails.length === 0) return null

  // Prefer generic hiring-related emails
  const priorities = ['careers@', 'jobs@', 'hiring@', 'talent@', 'recruit', 'hr@', 'people@']
  for (const prefix of priorities) {
    const match = result.emails.find((e) => e.value.toLowerCase().startsWith(prefix))
    if (match) return { email: match.value, domain: result.domain }
  }

  // Fall back to highest-confidence generic email
  const generics = result.emails.filter((e) => e.type === 'generic').sort((a, b) => b.confidence - a.confidence)
  if (generics.length > 0) return { email: generics[0].value, domain: result.domain }

  // Fall back to highest-confidence personal email (for small companies)
  const personals = result.emails.filter((e) => e.type === 'personal').sort((a, b) => b.confidence - a.confidence)
  if (personals.length > 0) return { email: personals[0].value, domain: result.domain }

  return null
}

// ─── Email verifier ────────────────────────────────────────────────────────

export type HunterVerifyStatus =
  | 'valid'          // deliverable
  | 'accept_all'     // domain accepts everything — can't confirm per-address
  | 'webmail'        // gmail/outlook/etc — can't verify mailbox but domain is real
  | 'invalid'        // confirmed undeliverable
  | 'disposable'     // throwaway domain
  | 'unknown'        // Hunter couldn't decide
  | 'error'          // network / quota / auth failure

export interface HunterVerifyResult {
  email: string
  status: HunterVerifyStatus
  score: number // 0-100; Hunter's deliverability confidence
  regexp: boolean
  gibberish: boolean
  disposable: boolean
  webmail: boolean
  mxRecords: boolean
  smtpServer: boolean
  smtpCheck: boolean
  acceptAll: boolean
  block: boolean
}

/**
 * Verify deliverability of a single email address via Hunter.io.
 * Returns null if HUNTER_API_KEY is not set — callers should fall back to
 * a cheaper MX-only check in that case.
 */
export async function hunterVerifyEmail(email: string, userId?: string | null): Promise<HunterVerifyResult | null> {
  if (!HUNTER_API_KEY) return null
  if (!email) return null

  try {
    const res = await fetch(
      `${BASE}/email-verifier?email=${encodeURIComponent(email)}&api_key=${HUNTER_API_KEY}`,
    )
    await recordHunterRequest(userId)
    if (!res.ok) {
      console.warn('Hunter verify error:', res.status)
      return {
        email,
        status: 'error',
        score: 0,
        regexp: false,
        gibberish: false,
        disposable: false,
        webmail: false,
        mxRecords: false,
        smtpServer: false,
        smtpCheck: false,
        acceptAll: false,
        block: false,
      }
    }
    const raw = await res.json() as {
      data?: {
        status?: string
        result?: string
        score?: number
        regexp?: boolean
        gibberish?: boolean
        disposable?: boolean
        webmail?: boolean
        mx_records?: boolean
        smtp_server?: boolean
        smtp_check?: boolean
        accept_all?: boolean
        block?: boolean
      }
    }
    const d = raw.data ?? {}

    // Hunter uses `status` (newer API) or `result` (older) for the verdict
    const verdict = (d.status ?? d.result ?? 'unknown').toLowerCase()
    const status: HunterVerifyStatus =
      verdict === 'valid' ? 'valid'
      : verdict === 'invalid' ? 'invalid'
      : verdict === 'accept_all' ? 'accept_all'
      : verdict === 'webmail' ? 'webmail'
      : verdict === 'disposable' ? 'disposable'
      : 'unknown'

    return {
      email,
      status,
      score: d.score ?? 0,
      regexp: !!d.regexp,
      gibberish: !!d.gibberish,
      disposable: !!d.disposable,
      webmail: !!d.webmail,
      mxRecords: !!d.mx_records,
      smtpServer: !!d.smtp_server,
      smtpCheck: !!d.smtp_check,
      acceptAll: !!d.accept_all,
      block: !!d.block,
    }
  } catch (err) {
    console.warn('Hunter verify fetch failed:', err)
    return {
      email,
      status: 'error',
      score: 0,
      regexp: false,
      gibberish: false,
      disposable: false,
      webmail: false,
      mxRecords: false,
      smtpServer: false,
      smtpCheck: false,
      acceptAll: false,
      block: false,
    }
  }
}
