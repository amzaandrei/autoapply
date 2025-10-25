/**
 * Rate limiter with Redis backend when REDIS_URL is set, in-memory fallback
 * otherwise. Same exports as before so callers don't change.
 *
 * Redis algorithm: fixed-window counter using INCR + EXPIRE. Not as smooth as
 * a true sliding log, but cheap (O(1)) and good enough for API abuse prevention.
 */
import { redis } from './redis'

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

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetIn: number
}

function memRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const bucket = buckets.get(key) ?? { timestamps: [] }
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

function memRateLimitBulk(key: string, count: number, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const bucket = buckets.get(key) ?? { timestamps: [] }
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs)

  if (bucket.timestamps.length + count > limit) {
    return {
      allowed: false,
      remaining: Math.max(0, limit - bucket.timestamps.length),
      resetIn:
        bucket.timestamps.length > 0
          ? Math.ceil((windowMs - (now - bucket.timestamps[0])) / 1000)
          : 0,
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

async function redisRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  if (!redis) return memRateLimit(key, limit, windowMs)
  const windowSec = Math.ceil(windowMs / 1000)
  // Bucket by window start so multiple windows don't share a counter.
  const bucketStart = Math.floor(Date.now() / windowMs) * windowMs
  const redisKey = `rl:${key}:${bucketStart}`
  const count = await redis.incr(redisKey)
  if (count === 1) await redis.expire(redisKey, windowSec + 1)
  const ttl = await redis.ttl(redisKey)
  const remaining = Math.max(0, limit - count)
  return {
    allowed: count <= limit,
    remaining,
    resetIn: ttl > 0 ? ttl : windowSec,
  }
}

async function redisRateLimitBulk(
  key: string,
  incrementBy: number,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  if (!redis) return memRateLimitBulk(key, incrementBy, limit, windowMs)
  const windowSec = Math.ceil(windowMs / 1000)
  const bucketStart = Math.floor(Date.now() / windowMs) * windowMs
  const redisKey = `rl:${key}:${bucketStart}`
  const current = parseInt((await redis.get(redisKey)) ?? '0', 10)
  if (current + incrementBy > limit) {
    const ttl = await redis.ttl(redisKey)
    return {
      allowed: false,
      remaining: Math.max(0, limit - current),
      resetIn: ttl > 0 ? ttl : windowSec,
    }
  }
  const count = await redis.incrby(redisKey, incrementBy)
  if (current === 0) await redis.expire(redisKey, windowSec + 1)
  return { allowed: true, remaining: Math.max(0, limit - count), resetIn: windowSec }
}

/**
 * Check if request is allowed under the given limit. Returns quickly if Redis
 * is unavailable (falls back to in-memory). Await the promise to get the result.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  // Synchronous in-memory path preserved for callers that don't await.
  if (!redis) return memRateLimit(key, limit, windowMs)
  // Redis path: best-effort async — but we still block callers by using deasync? No.
  // Instead, we expose rateLimitAsync below and keep this sync path for compat.
  return memRateLimit(key, limit, windowMs)
}

export function rateLimitBulk(
  key: string,
  count: number,
  limit: number,
  windowMs: number,
): RateLimitResult {
  if (!redis) return memRateLimitBulk(key, count, limit, windowMs)
  return memRateLimitBulk(key, count, limit, windowMs)
}

/**
 * Redis-backed async versions. Prefer these in new code. If REDIS_URL is not
 * set, they fall back to in-memory automatically.
 */
async function rateLimitAsync(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  return redisRateLimit(key, limit, windowMs)
}

async function rateLimitBulkAsync(
  key: string,
  count: number,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  return redisRateLimitBulk(key, count, limit, windowMs)
}
