// Server-safe geocoding cache using in-memory Map.
// Pattern mirrors lib/rate-limit.ts.
// 24h TTL for successful geocodes, 1h for null/miss results (avoid hammering Mapbox with bad inputs).

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? process.env.MAPBOX_TOKEN ?? ''
const BASE = 'https://api.mapbox.com/search/geocode/v6'

interface GeocodedLocation {
  name: string         // full name ("San Francisco, California, United States")
  shortName: string    // "San Francisco, US"
  lat: number
  lng: number
}

interface CacheEntry {
  data: GeocodedLocation | null
  expires: number
}

const cache = new Map<string, CacheEntry>()
const SUCCESS_TTL = 24 * 60 * 60 * 1000
const NULL_TTL = 60 * 60 * 1000

// Auto-cleanup every 30 min
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of cache.entries()) {
    if (entry.expires < now) cache.delete(key)
  }
}, 30 * 60 * 1000).unref?.()

// Strings that should never be geocoded
const SKIP_PATTERNS = [
  /^\s*$/,
  /^remote/i,
  /^anywhere/i,
  /^worldwide/i,
  /^global/i,
  /^unknown/i,
]

function normalizeQuery(q: string): string {
  return (q ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
}

function shouldSkip(q: string): boolean {
  if (!q) return true
  return SKIP_PATTERNS.some((p) => p.test(q))
}

function toShortName(fullName: string): string {
  const parts = fullName.split(', ')
  if (parts.length <= 2) return fullName
  return `${parts[0]}, ${parts[parts.length - 1]}`
}

async function geocodeForward(query: string): Promise<GeocodedLocation | null> {
  const key = normalizeQuery(query)
  if (shouldSkip(key)) return null
  if (!TOKEN) return null

  const now = Date.now()
  const cached = cache.get(key)
  if (cached && cached.expires > now) return cached.data

  try {
    const res = await fetch(
      `${BASE}/forward?q=${encodeURIComponent(query)}&types=place,country,locality&limit=1&access_token=${TOKEN}`
    )
    if (!res.ok) {
      // Don't cache transient errors (4xx cached briefly, 5xx not at all)
      if (res.status >= 500) return null
      cache.set(key, { data: null, expires: now + NULL_TTL })
      return null
    }
    const data = await res.json() as {
      features?: Array<{
        properties?: { full_address?: string; name?: string }
        geometry: { coordinates: number[] }
      }>
    }
    const f = data.features?.[0]
    if (!f) {
      cache.set(key, { data: null, expires: now + NULL_TTL })
      return null
    }
    const name = f.properties?.full_address ?? f.properties?.name ?? query
    const result: GeocodedLocation = {
      name,
      shortName: toShortName(name),
      lng: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    }
    cache.set(key, { data: result, expires: now + SUCCESS_TTL })
    return result
  } catch {
    // Network error — don't cache, caller can retry later
    return null
  }
}

// Concurrency-limited helper
async function parallelLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return results
}

/**
 * Batch geocode multiple query strings. Deduplicates internally.
 * Returns a Map keyed by normalized query → result (or null).
 */
export async function geocodeForwardBatch(queries: string[]): Promise<Map<string, GeocodedLocation | null>> {
  const unique = [...new Set(queries.map(normalizeQuery).filter((q) => !shouldSkip(q)))]
  const results = await parallelLimit(unique, 4, (q) => geocodeForward(q))
  const out = new Map<string, GeocodedLocation | null>()
  unique.forEach((q, idx) => out.set(q, results[idx]))
  return out
}

function clearGeocodeCache() {
  cache.clear()
}
