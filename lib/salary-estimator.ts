// Heuristic salary estimator when real data isn't available.
// Ranges based on publicly available salary data (Glassdoor, Levels.fyi, devhire.ch for CH).
// Format: { min, max } in local currency per year.

type SalaryRange = { min: number; max: number; currency: string }

const ROLE_BASELINES: Record<string, SalaryRange> = {
  'software engineer':          { min: 80,  max: 140, currency: 'USD' },
  'senior software engineer':   { min: 120, max: 200, currency: 'USD' },
  'staff software engineer':    { min: 180, max: 280, currency: 'USD' },
  'frontend developer':         { min: 75,  max: 130, currency: 'USD' },
  'backend developer':          { min: 80,  max: 140, currency: 'USD' },
  'full stack developer':       { min: 80,  max: 140, currency: 'USD' },
  'mobile engineer':            { min: 85,  max: 150, currency: 'USD' },
  'ios developer':              { min: 85,  max: 150, currency: 'USD' },
  'android developer':          { min: 85,  max: 150, currency: 'USD' },
  'devops engineer':            { min: 95,  max: 170, currency: 'USD' },
  'site reliability engineer':  { min: 110, max: 200, currency: 'USD' },
  'cloud engineer':             { min: 100, max: 175, currency: 'USD' },
  'platform engineer':          { min: 110, max: 190, currency: 'USD' },
  'data engineer':              { min: 95,  max: 170, currency: 'USD' },
  'data scientist':             { min: 100, max: 180, currency: 'USD' },
  'data analyst':               { min: 70,  max: 120, currency: 'USD' },
  'machine learning engineer':  { min: 120, max: 220, currency: 'USD' },
  'ai engineer':                { min: 130, max: 230, currency: 'USD' },
  'product manager':            { min: 110, max: 190, currency: 'USD' },
  'product designer':           { min: 90,  max: 160, currency: 'USD' },
  'ux designer':                { min: 80,  max: 140, currency: 'USD' },
  'ui designer':                { min: 75,  max: 130, currency: 'USD' },
  'engineering manager':        { min: 150, max: 260, currency: 'USD' },
  'tech lead':                  { min: 130, max: 220, currency: 'USD' },
  'qa engineer':                { min: 70,  max: 120, currency: 'USD' },
  'security engineer':          { min: 110, max: 200, currency: 'USD' },
  'solutions architect':        { min: 120, max: 210, currency: 'USD' },
  'developer advocate':         { min: 100, max: 180, currency: 'USD' },
}

// Region multipliers — roughly calibrated (devhire.ch uses similar ranges for CH)
const REGION_MULTIPLIERS: Array<{ match: RegExp; multiplier: number; currency: string }> = [
  { match: /switzerland|zurich|zürich|geneva|basel|bern/i, multiplier: 1.35, currency: 'CHF' },
  { match: /san francisco|bay area|silicon valley/i,       multiplier: 1.45, currency: 'USD' },
  { match: /new york|nyc/i,                                multiplier: 1.25, currency: 'USD' },
  { match: /seattle|boston|los angeles/i,                  multiplier: 1.15, currency: 'USD' },
  { match: /london|united kingdom/i,                        multiplier: 1.10, currency: 'GBP' },
  { match: /dublin|ireland/i,                               multiplier: 1.00, currency: 'EUR' },
  { match: /amsterdam|netherlands/i,                        multiplier: 0.95, currency: 'EUR' },
  { match: /berlin|munich|germany/i,                        multiplier: 0.85, currency: 'EUR' },
  { match: /paris|france/i,                                 multiplier: 0.85, currency: 'EUR' },
  { match: /madrid|spain|barcelona/i,                       multiplier: 0.70, currency: 'EUR' },
  { match: /milan|rome|italy/i,                             multiplier: 0.70, currency: 'EUR' },
  { match: /lisbon|portugal/i,                              multiplier: 0.60, currency: 'EUR' },
  { match: /stockholm|sweden|copenhagen|denmark/i,          multiplier: 0.95, currency: 'EUR' },
  { match: /singapore/i,                                    multiplier: 1.00, currency: 'USD' },
  { match: /sydney|melbourne|australia/i,                   multiplier: 0.95, currency: 'USD' },
  { match: /toronto|vancouver|canada/i,                     multiplier: 0.90, currency: 'USD' },
  { match: /bangalore|india/i,                              multiplier: 0.35, currency: 'USD' },
  { match: /tel aviv|israel/i,                              multiplier: 1.00, currency: 'USD' },
  { match: /tokyo|japan/i,                                  multiplier: 0.85, currency: 'USD' },
  { match: /remote/i,                                       multiplier: 1.00, currency: 'USD' },
]

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CHF: 'CHF ',
}

function pickRole(jobTitle: string): SalaryRange | null {
  const lower = jobTitle.toLowerCase()
  // Exact match first
  if (ROLE_BASELINES[lower]) return ROLE_BASELINES[lower]
  // Best keyword match
  let best: SalaryRange | null = null
  let bestLen = 0
  for (const [key, range] of Object.entries(ROLE_BASELINES)) {
    if (lower.includes(key) && key.length > bestLen) {
      best = range
      bestLen = key.length
    }
  }
  return best
}

export function estimateSalary(jobTitle: string, region: string): string | null {
  if (!jobTitle) return null

  const baseline = pickRole(jobTitle)
  if (!baseline) return null

  const regionMatch = REGION_MULTIPLIERS.find((r) => r.match.test(region))
  const multiplier = regionMatch?.multiplier ?? 1.0
  const currency = regionMatch?.currency ?? baseline.currency

  const min = Math.round(baseline.min * multiplier)
  const max = Math.round(baseline.max * multiplier)
  const sym = CURRENCY_SYMBOLS[currency] ?? `${currency} `

  return `~${sym}${min}k-${max}k/yr`
}
