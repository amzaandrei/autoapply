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

// Company enrichment has a separate Hunter quota pool — track independently
// so we can gate it at a different tier limit than domain-search/verify.
async function recordHunterEnrichment(userId: string | null | undefined): Promise<void> {
  if (!userId) return
  try {
    await incrementUsage(userId, 'hunter_enrichment', 1)
  } catch (err) {
    console.warn('Failed to record hunter_enrichment usage:', err)
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
// ─── Email Finder (name → verified email) ──────────────────────────────────

export interface HunterEmailFinderResult {
  email: string
  score: number
  domain: string | null
  firstName: string | null
  lastName: string | null
  position: string | null
  verification: { status: HunterVerifyStatus; date: string | null } | null
}

/**
 * Given a domain + person name, Hunter guesses the company's email pattern
 * and verifies a candidate address. Counts against the same request pool as
 * domain-search/verify, so no separate quota gating is needed.
 *
 * Returns null if HUNTER_API_KEY is missing, the inputs are insufficient,
 * or Hunter couldn't produce a candidate with reasonable confidence.
 */
export async function hunterEmailFinder(input: {
  domain?: string | null
  company?: string | null
  firstName: string
  lastName: string
  userId?: string | null
}): Promise<HunterEmailFinderResult | null> {
  if (!HUNTER_API_KEY) return null
  const first = input.firstName.trim()
  const last = input.lastName.trim()
  if (!first || !last) return null

  const cleanDomain = input.domain?.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  const company = input.company?.trim()
  if (!cleanDomain && !company) return null

  try {
    const params = new URLSearchParams({
      api_key: HUNTER_API_KEY,
      first_name: first,
      last_name: last,
    })
    if (cleanDomain) params.set('domain', cleanDomain)
    else if (company) params.set('company', company)

    const res = await fetch(`${BASE}/email-finder?${params.toString()}`)
    await recordHunterRequest(input.userId)
    if (!res.ok) {
      if (res.status === 400 || res.status === 404) return null
      console.warn('Hunter email-finder error:', res.status)
      return null
    }

    const raw = (await res.json()) as {
      data?: {
        email?: string
        score?: number
        domain?: string
        first_name?: string
        last_name?: string
        position?: string
        verification?: { status?: string; date?: string } | null
      }
    }
    const d = raw.data
    if (!d?.email) return null

    const verdict = (d.verification?.status ?? '').toLowerCase()
    const vStatus: HunterVerifyStatus =
      verdict === 'valid' ? 'valid'
      : verdict === 'invalid' ? 'invalid'
      : verdict === 'accept_all' ? 'accept_all'
      : verdict === 'webmail' ? 'webmail'
      : verdict === 'disposable' ? 'disposable'
      : 'unknown'

    return {
      email: d.email,
      score: d.score ?? 0,
      domain: d.domain ?? cleanDomain ?? null,
      firstName: d.first_name ?? first,
      lastName: d.last_name ?? last,
      position: d.position ?? null,
      verification: d.verification ? { status: vStatus, date: d.verification.date ?? null } : null,
    }
  } catch (err) {
    console.warn('Hunter email-finder fetch failed:', err)
    return null
  }
}

// ─── Company Enrichment (firmographics) ────────────────────────────────────

export interface HunterCompanyEnrichment {
  domain: string
  name: string | null
  description: string | null
  industry: string | null
  foundedYear: number | null
  employeeCount: string | null
  country: string | null
  locality: string | null
  logo: string | null
  linkedIn: string | null
  twitter: string | null
  techStack: string[]
}

/**
 * Hunter Company Enrichment — returns authoritative firmographics for a
 * domain. Counts against a SEPARATE quota (enrichment credits), not the
 * shared search/verify pool. Gate behind paid tiers.
 *
 * Returns null if the key is missing, the domain isn't in Hunter's dataset,
 * or the request fails.
 */
export async function hunterEnrichCompany(input: {
  domain: string
  userId?: string | null
}): Promise<HunterCompanyEnrichment | null> {
  if (!HUNTER_API_KEY) return null
  const domain = input.domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  if (!domain) return null

  try {
    const res = await fetch(
      `${BASE}/companies/find?domain=${encodeURIComponent(domain)}&api_key=${HUNTER_API_KEY}`,
    )
    await recordHunterEnrichment(input.userId)
    if (!res.ok) {
      if (res.status === 400 || res.status === 404) return null
      console.warn('Hunter enrichment error:', res.status)
      return null
    }

    const raw = (await res.json()) as {
      data?: {
        id?: string
        name?: string
        legalName?: string
        domain?: string
        description?: string
        foundedYear?: number | null
        category?: { industry?: string; industryGroup?: string }
        metrics?: { employees?: number | null; employeesRange?: string | null }
        geo?: { country?: string; countryCode?: string; city?: string; state?: string }
        logo?: string
        linkedin?: { handle?: string }
        twitter?: { handle?: string }
        tech?: string[]
      }
    }
    const d = raw.data
    if (!d) return null

    const linkedInHandle = d.linkedin?.handle
    const twitterHandle = d.twitter?.handle
    return {
      domain: d.domain ?? domain,
      name: d.name ?? d.legalName ?? null,
      description: d.description ?? null,
      industry: d.category?.industry ?? d.category?.industryGroup ?? null,
      foundedYear: d.foundedYear ?? null,
      employeeCount: d.metrics?.employeesRange ?? (d.metrics?.employees ? String(d.metrics.employees) : null),
      country: d.geo?.country ?? null,
      locality: d.geo?.city ?? d.geo?.state ?? null,
      logo: d.logo ?? null,
      linkedIn: linkedInHandle ? `https://www.linkedin.com/${linkedInHandle.startsWith('company/') ? linkedInHandle : 'company/' + linkedInHandle}` : null,
      twitter: twitterHandle ? `https://twitter.com/${twitterHandle}` : null,
      techStack: Array.isArray(d.tech) ? d.tech : [],
    }
  } catch (err) {
    console.warn('Hunter enrichment fetch failed:', err)
    return null
  }
}

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
