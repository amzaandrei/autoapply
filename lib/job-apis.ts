import type { CompanyResult } from './ai'

interface JobResult {
  jobTitle: string
  company: string
  companyDomain: string | null
  location: string
  description: string
  salary: string | null
  applyUrl: string
  source: 'jsearch' | 'remotive' | 'arbeitnow' | 'themuse'
  postedAt: string | null
}

// Clean up free-form salary strings from Remotive etc. into compact format
function normalizeSalaryString(raw?: string | null): string | null {
  if (!raw) return null
  const cleaned = raw.trim()
  if (!cleaned) return null

  // Strip anything in parentheses (e.g. "(depending on experience)")
  const noParens = cleaned.replace(/\s*\([^)]*\)\s*/g, '').trim()

  // Extract first range-like pattern — matches "$60k-$130k", "80-120k", "€50,000-70,000", etc.
  const rangeMatch = noParens.match(/([€$£]|CHF\s*)?\s*(\d+[.,]?\d*\s*[kK]?)\s*[-–—to]+\s*([€$£]|CHF\s*)?\s*(\d+[.,]?\d*\s*[kK]?)/)
  if (rangeMatch) {
    const sym = rangeMatch[1]?.trim() || rangeMatch[3]?.trim() || ''
    const min = rangeMatch[2].toLowerCase().replace(/,/g, '')
    const max = rangeMatch[4].toLowerCase().replace(/,/g, '')
    return `${sym}${min}-${max}`.replace(/\s+/g, '').slice(0, 20)
  }

  // Single value?
  const singleMatch = noParens.match(/([€$£]|CHF\s*)?\s*(\d+[.,]?\d*\s*[kK]?)/)
  if (singleMatch) {
    const sym = singleMatch[1]?.trim() ?? ''
    const val = singleMatch[2].toLowerCase().replace(/,/g, '')
    return `${sym}${val}`.replace(/\s+/g, '').slice(0, 20)
  }

  return noParens.slice(0, 20)
}

function extractDomain(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    // Skip job board domains — we want the company domain
    if (['linkedin.com', 'indeed.com', 'glassdoor.com', 'ziprecruiter.com', 'remotive.com', 'arbeitnow.com'].some(d => host.includes(d))) return null
    return host
  } catch {
    return null
  }
}

// ─── JSearch (RapidAPI) — worldwide ──────────────────────────────────────

export async function searchJSearch(title: string, location: string, count: number = 20): Promise<JobResult[]> {
  const apiKey = process.env.RAPIDAPI_KEY
  if (!apiKey) return []

  try {
    const query = location ? `${title} in ${location}` : title
    const res = await fetch(
      `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(query)}&num_pages=1&page=1`,
      {
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
        },
      }
    )
    if (!res.ok) { console.warn('JSearch API error:', res.status); return [] }

    const data = await res.json() as {
      data?: Array<{
        job_title?: string
        employer_name?: string
        employer_website?: string
        job_city?: string
        job_country?: string
        job_description?: string
        job_apply_link?: string
        job_posted_at_datetime_utc?: string
        job_min_salary?: number
        job_max_salary?: number
        job_salary_currency?: string
        job_salary_period?: string
      }>
    }

    const formatSalary = (min?: number, max?: number, currency?: string, period?: string): string | null => {
      if (!min && !max) return null
      const cur = currency ?? 'USD'
      const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : cur === 'CHF' ? 'CHF ' : `${cur} `
      const fmt = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
      const range = min && max ? `${fmt(min)}-${fmt(max)}` : fmt(min ?? max!)
      const suffix = period && period.toLowerCase() === 'year' ? '/yr' : period && period.toLowerCase() === 'month' ? '/mo' : ''
      return `${sym}${range}${suffix}`
    }

    return (data.data ?? []).slice(0, count).map((job) => ({
      jobTitle: job.job_title ?? '',
      company: job.employer_name ?? '',
      companyDomain: job.employer_website ? extractDomain(job.employer_website) : null,
      location: [job.job_city, job.job_country].filter(Boolean).join(', '),
      description: (job.job_description ?? '').slice(0, 500),
      salary: formatSalary(job.job_min_salary, job.job_max_salary, job.job_salary_currency, job.job_salary_period),
      applyUrl: job.job_apply_link ?? '',
      source: 'jsearch' as const,
      postedAt: job.job_posted_at_datetime_utc ?? null,
    }))
  } catch (err) {
    console.warn('JSearch fetch failed:', err)
    return []
  }
}

// ─── Remotive — remote jobs ─────────────────────────────────────────────

export async function searchRemotive(title: string, count: number = 20): Promise<JobResult[]> {
  try {
    const res = await fetch(
      `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(title)}&limit=${count}`
    )
    if (!res.ok) { console.warn('Remotive API error:', res.status); return [] }

    const data = await res.json() as {
      jobs?: Array<{
        title?: string
        company_name?: string
        candidate_required_location?: string
        salary?: string
        url?: string
        description?: string
        publication_date?: string
        tags?: string[]
      }>
    }

    return (data.jobs ?? []).slice(0, count).map((job) => ({
      jobTitle: job.title ?? '',
      company: job.company_name ?? '',
      companyDomain: job.url ? extractDomain(job.url) : null,
      location: job.candidate_required_location ?? 'Remote',
      description: (job.description ?? '').replace(/<[^>]+>/g, '').slice(0, 500),
      salary: normalizeSalaryString(job.salary),
      applyUrl: job.url ?? '',
      source: 'remotive' as const,
      postedAt: job.publication_date ?? null,
    }))
  } catch (err) {
    console.warn('Remotive fetch failed:', err)
    return []
  }
}

// ─── Arbeitnow — EU/DACH jobs ──────────────────────────────────────────

export async function searchArbeitnow(title: string, count: number = 20): Promise<JobResult[]> {
  try {
    const res = await fetch('https://www.arbeitnow.com/api/job-board-api')
    if (!res.ok) { console.warn('Arbeitnow API error:', res.status); return [] }

    const data = await res.json() as {
      data?: Array<{
        title?: string
        company_name?: string
        location?: string
        remote?: boolean
        url?: string
        description?: string
        created_at?: number
        tags?: string[]
      }>
    }

    // Client-side title filter (Arbeitnow has no search param)
    const titleLower = title.toLowerCase()
    const keywords = titleLower.split(/[\s,]+/).filter(Boolean)

    const matched = (data.data ?? []).filter((job) => {
      const jobText = `${job.title ?? ''} ${(job.tags ?? []).join(' ')}`.toLowerCase()
      return keywords.some((kw) => jobText.includes(kw))
    })

    return matched.slice(0, count).map((job) => ({
      jobTitle: job.title ?? '',
      company: job.company_name ?? '',
      companyDomain: job.url ? extractDomain(job.url) : null,
      location: job.location ?? (job.remote ? 'Remote' : 'Europe'),
      description: (job.description ?? '').replace(/<[^>]+>/g, '').slice(0, 500),
      salary: null,
      applyUrl: job.url ?? '',
      source: 'arbeitnow' as const,
      postedAt: job.created_at ? new Date(job.created_at * 1000).toISOString() : null,
    }))
  } catch (err) {
    console.warn('Arbeitnow fetch failed:', err)
    return []
  }
}

// ─── The Muse — curated tech companies ──────────────────────────────────

export async function searchTheMuse(title: string, location: string, count: number = 20): Promise<JobResult[]> {
  try {
    const params = new URLSearchParams()
    params.set('page', '0')
    // The Muse uses category names; map common titles
    const category = mapTitleToMuseCategory(title)
    if (category) params.set('category', category)
    // Location filter — The Muse accepts city names or "Flexible / Remote"
    if (location && !location.toLowerCase().includes('remote')) {
      params.set('location', location.split(',')[0].trim())
    }
    if (location.toLowerCase().includes('remote')) {
      params.set('flexibility', 'Remote')
    }

    const res = await fetch(`https://www.themuse.com/api/public/jobs?${params.toString()}`)
    if (!res.ok) { console.warn('Muse API error:', res.status); return [] }

    const data = await res.json() as {
      results?: Array<{
        name?: string
        company?: { name?: string; short_name?: string }
        contents?: string
        locations?: Array<{ name?: string }>
        refs?: { landing_page?: string }
        publication_date?: string
      }>
    }

    const titleLower = title.toLowerCase()
    // Client-side filter: title must match
    const matched = (data.results ?? []).filter((j) => (j.name ?? '').toLowerCase().includes(titleLower.split(' ')[0]))

    return matched.slice(0, count).map((j) => ({
      jobTitle: j.name ?? '',
      company: j.company?.name ?? '',
      companyDomain: j.company?.short_name ? `${j.company.short_name}.com` : null,
      location: j.locations?.[0]?.name ?? 'Unknown',
      description: (j.contents ?? '').replace(/<[^>]+>/g, '').slice(0, 500),
      salary: null,
      applyUrl: j.refs?.landing_page ?? '',
      source: 'themuse' as const,
      postedAt: j.publication_date ?? null,
    }))
  } catch (err) {
    console.warn('Muse fetch failed:', err)
    return []
  }
}

function mapTitleToMuseCategory(title: string): string | null {
  const lower = title.toLowerCase()
  if (lower.includes('engineer') || lower.includes('developer') || lower.includes('programmer')) return 'Software Engineer'
  if (lower.includes('designer') || lower.includes('ux') || lower.includes('ui')) return 'Design'
  if (lower.includes('product manager') || lower.includes('pm ')) return 'Product'
  if (lower.includes('data') || lower.includes('analyst')) return 'Data Science'
  if (lower.includes('marketing')) return 'Marketing'
  if (lower.includes('sales')) return 'Sales'
  if (lower.includes('devops') || lower.includes('sre') || lower.includes('cloud')) return 'Software Engineering'
  return null
}

// ─── ATS APIs — Greenhouse, Lever, Ashby ────────────────────────────────
// Many tech companies publish their openings via these ATS platforms.
// No auth needed. Requires a company slug.

function companyToSlug(name: string): string[] {
  const base = name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim()
  return [
    base.replace(/\s+/g, ''),           // "stripeinc"
    base.replace(/\s+/g, '-'),          // "stripe-inc"
    base.split(/\s+/)[0],               // "stripe"
  ].filter((s, i, a) => s && a.indexOf(s) === i)
}

interface ATSJob {
  title: string
  location: string
  url: string
  postedAt: string | null
}

export async function fetchGreenhouseJobs(companyName: string): Promise<ATSJob[]> {
  for (const slug of companyToSlug(companyName)) {
    try {
      const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`)
      if (!res.ok) continue
      const data = await res.json() as {
        jobs?: Array<{
          title?: string; location?: { name?: string }; absolute_url?: string; updated_at?: string
        }>
      }
      const jobs = data.jobs ?? []
      if (jobs.length === 0) continue
      return jobs.map((j) => ({
        title: j.title ?? '',
        location: j.location?.name ?? '',
        url: j.absolute_url ?? '',
        postedAt: j.updated_at ?? null,
      }))
    } catch { continue }
  }
  return []
}

export async function fetchLeverJobs(companyName: string): Promise<ATSJob[]> {
  for (const slug of companyToSlug(companyName)) {
    try {
      const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`)
      if (!res.ok) continue
      const data = await res.json() as Array<{
        text?: string; categories?: { location?: string }; hostedUrl?: string; createdAt?: number
      }>
      if (!Array.isArray(data) || data.length === 0) continue
      return data.map((j) => ({
        title: j.text ?? '',
        location: j.categories?.location ?? '',
        url: j.hostedUrl ?? '',
        postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
      }))
    } catch { continue }
  }
  return []
}

export async function fetchAshbyJobs(companyName: string): Promise<ATSJob[]> {
  for (const slug of companyToSlug(companyName)) {
    try {
      const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`)
      if (!res.ok) continue
      const data = await res.json() as {
        jobs?: Array<{
          title?: string; locationName?: string; jobUrl?: string; publishedDate?: string
        }>
      }
      const jobs = data.jobs ?? []
      if (jobs.length === 0) continue
      return jobs.map((j) => ({
        title: j.title ?? '',
        location: j.locationName ?? '',
        url: j.jobUrl ?? '',
        postedAt: j.publishedDate ?? null,
      }))
    } catch { continue }
  }
  return []
}

/**
 * Try all three ATS platforms. Returns the first one that has jobs, or empty array.
 * Good for verifying a specific company has current openings.
 */
export async function fetchATSJobs(companyName: string): Promise<{ source: 'greenhouse' | 'lever' | 'ashby' | null; jobs: ATSJob[] }> {
  const [gh, lever, ashby] = await Promise.all([
    fetchGreenhouseJobs(companyName),
    fetchLeverJobs(companyName),
    fetchAshbyJobs(companyName),
  ])
  if (gh.length > 0) return { source: 'greenhouse', jobs: gh }
  if (lever.length > 0) return { source: 'lever', jobs: lever }
  if (ashby.length > 0) return { source: 'ashby', jobs: ashby }
  return { source: null, jobs: [] }
}

// ─── Combined search + dedup + map to CompanyResult ─────────────────────

export async function searchAllJobAPIs(
  title: string,
  location: string,
  mode: 'all' | 'top10' | 'best3' = 'top10'
): Promise<CompanyResult[]> {
  const targetCount = mode === 'all' ? 25 : mode === 'top10' ? 10 : 3
  const isRemote = location.toLowerCase().includes('remote')

  // Fetch all APIs in parallel
  const [jsearchResults, remotiveResults, arbeitnowResults, museResults] = await Promise.all([
    searchJSearch(title, location, targetCount),
    isRemote ? searchRemotive(title, targetCount) : searchRemotive(title, 10),
    searchArbeitnow(title, targetCount),
    searchTheMuse(title, location, targetCount),
  ])

  const allJobs: JobResult[] = [...jsearchResults, ...remotiveResults, ...arbeitnowResults, ...museResults]

  // Group by company name (case-insensitive dedup)
  const companyMap = new Map<string, JobResult[]>()
  for (const job of allJobs) {
    if (!job.company) continue
    const key = job.company.toLowerCase().trim()
    const existing = companyMap.get(key) ?? []
    existing.push(job)
    companyMap.set(key, existing)
  }

  // Map to CompanyResult format
  const results: CompanyResult[] = []
  for (const [, jobs] of companyMap) {
    const first = jobs[0]
    const jobTitles = [...new Set(jobs.map((j) => j.jobTitle))].slice(0, 3)
    const sources = [...new Set(jobs.map((j) => j.source))]
    // Pick the first available salary from the grouped jobs
    const salaryRange = jobs.find((j) => j.salary)?.salary ?? null

    // Prefer the most specific (non-empty, non-"Remote") location
    const location = jobs.find((j) => j.location && !/^remote$/i.test(j.location))?.location
      ?? jobs.find((j) => j.location)?.location
      ?? null

    results.push({
      name: first.company,
      domain: first.companyDomain ?? jobs.find((j) => j.companyDomain)?.companyDomain ?? '',
      industry: '',
      size: '',
      description: first.description.slice(0, 300),
      contactEmail: null,
      contactName: null,
      linkedIn: null,
      matchReason: `Hiring: ${jobTitles.join(', ')} — via ${sources.join(', ')}`,
      salaryRange,
      location,
    })
  }

  const topResults = results.slice(0, targetCount)

  // ATS verification pass — check Greenhouse/Lever/Ashby for the top results
  // This gives us "real-time verified" signal for tech companies that use these ATS platforms
  const verified = await Promise.all(
    topResults.map(async (company) => {
      const ats = await fetchATSJobs(company.name)
      if (ats.source && ats.jobs.length > 0) {
        return {
          ...company,
          matchReason: `${company.matchReason} · ✓ Verified ${ats.jobs.length} openings on ${ats.source}`,
        }
      }
      return company
    })
  )

  return verified
}
