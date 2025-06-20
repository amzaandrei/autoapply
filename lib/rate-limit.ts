// Simple in-memory sliding window rate limiter. Per-process only.
// For production with multiple instances, replace with Redis.

interface Bucket {
  timestamps: number[]
}

const buckets = new Map<string, Bucket>()

// Clean up stale buckets every 5 min
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  for (const [key, bucket] of buckets.entries()) {
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff)
    if (bucket.timestamps.length === 0) buckets.delete(key)
  }
}, 5 * 60 * 1000).unref?.()

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetIn: number // seconds until oldest request expires
}

/**
 * Check if request is allowed under the given limit.
 * @param key unique identifier (e.g. `generate:${userId}`)
 * @param limit max requests in the window
 * @param windowMs window length in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const bucket = buckets.get(key) ?? { timestamps: [] }
  // Drop expired entries
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs)

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0]
    return {
      allowed: false,
      remaining: 0,
      resetIn: Math.ceil((windowMs - (now - oldest)) / 1000),
    }
  }

  bucket.timestamps.push(now)
  buckets.set(key, bucket)
  return {
    allowed: true,
    remaining: limit - bucket.timestamps.length,
    resetIn: Math.ceil(windowMs / 1000),
  }
}

// Record that N operations happened (e.g. for per-company generation where one request = many AI calls)
export function rateLimitBulk(key: string, count: number, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const bucket = buckets.get(key) ?? { timestamps: [] }
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs)

  if (bucket.timestamps.length + count > limit) {
    return {
      allowed: false,
      remaining: Math.max(0, limit - bucket.timestamps.length),
      resetIn: bucket.timestamps.length > 0 ? Math.ceil((windowMs - (now - bucket.timestamps[0])) / 1000) : 0,
    }
  }

  for (let i = 0; i < count; i++) bucket.timestamps.push(now)
  buckets.set(key, bucket)
  return {
    allowed: true,
    remaining: limit - bucket.timestamps.length,
    resetIn: Math.ceil(windowMs / 1000),
  }
}
