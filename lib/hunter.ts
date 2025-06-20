// Hunter.io integration for finding company contact emails.
// Free tier: 25 requests/month. Set HUNTER_API_KEY in .env.local.
// Docs: https://hunter.io/api-documentation/v2

const HUNTER_API_KEY = process.env.HUNTER_API_KEY ?? ''
const BASE = 'https://api.hunter.io/v2'

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
 * Search Hunter.io for all known emails at a domain.
 * Prioritizes generic hiring emails (careers@, jobs@, hr@) if present.
 */
export async function hunterDomainSearch(domain: string): Promise<HunterDomainResult | null> {
  if (!HUNTER_API_KEY) return null
  if (!domain) return null

  try {
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
    const res = await fetch(
      `${BASE}/domain-search?domain=${encodeURIComponent(cleanDomain)}&api_key=${HUNTER_API_KEY}&department=hr&limit=10`
    )
    if (!res.ok) {
      // Try without department filter if HR filter returned nothing
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
 * Find the best hiring/careers email for a company domain via Hunter.io.
 * Returns null if no key set or nothing found.
 */
export async function hunterFindHiringEmail(domain: string): Promise<string | null> {
  const result = await hunterDomainSearch(domain)
  if (!result || result.emails.length === 0) return null

  // Prefer generic hiring-related emails
  const priorities = ['careers@', 'jobs@', 'hiring@', 'talent@', 'recruit', 'hr@', 'people@']
  for (const prefix of priorities) {
    const match = result.emails.find((e) => e.value.toLowerCase().startsWith(prefix))
    if (match) return match.value
  }

  // Fall back to highest-confidence generic email
  const generics = result.emails.filter((e) => e.type === 'generic').sort((a, b) => b.confidence - a.confidence)
  if (generics.length > 0) return generics[0].value

  // Fall back to highest-confidence personal email (for small companies)
  const personals = result.emails.filter((e) => e.type === 'personal').sort((a, b) => b.confidence - a.confidence)
  if (personals.length > 0) return personals[0].value

  return null
}
