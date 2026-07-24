import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Stub ioredis so importing the rate limiter can never open a socket. Combined
// with REDIS_URL="" (see vitest.config.ts) the module's `redis` singleton stays
// null, so every call flows through the in-memory fallback we exercise below.
vi.mock('ioredis', () => ({
  default: class {
    on() {}
  },
}))

// The redis singleton pulls in the pino logger, which spins up a pino-pretty
// transport worker at import time. Stub pino so the import chain has zero side
// effects (a no-op if the logger ever drops out of the chain).
vi.mock('pino', () => {
  const noop = () => {}
  const logger = {
    info: noop,
    error: noop,
    warn: noop,
    debug: noop,
    fatal: noop,
    trace: noop,
    child: () => logger,
  }
  return { default: () => logger }
})

import { rateLimit, rateLimitBulk } from '@/lib/rate-limit'

const BASE = new Date('2026-01-01T00:00:00Z').getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(BASE)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('rateLimit (in-memory fallback)', () => {
  it('allows the first request and reports remaining + resetIn', () => {
    expect(rateLimit('first', 3, 60_000)).toEqual({
      allowed: true,
      remaining: 2,
      resetIn: 60,
    })
  })

  it('enforces the limit and denies once the window is exhausted', () => {
    const key = 'exhaust'
    expect(rateLimit(key, 3, 60_000).remaining).toBe(2)
    expect(rateLimit(key, 3, 60_000).remaining).toBe(1)
    const last = rateLimit(key, 3, 60_000)
    expect(last.allowed).toBe(true)
    expect(last.remaining).toBe(0)

    const denied = rateLimit(key, 3, 60_000)
    expect(denied.allowed).toBe(false)
    expect(denied.remaining).toBe(0)
    // Oldest timestamp is at BASE and no time has passed, so the whole window remains.
    expect(denied.resetIn).toBe(60)
  })

  it('isolates buckets by key', () => {
    expect(rateLimit('iso-a', 1, 60_000).allowed).toBe(true)
    expect(rateLimit('iso-a', 1, 60_000).allowed).toBe(false)
    // A different key is unaffected by iso-a being exhausted.
    expect(rateLimit('iso-b', 1, 60_000).allowed).toBe(true)
  })

  it('resets after the window elapses', () => {
    const key = 'reset'
    expect(rateLimit(key, 2, 1_000).allowed).toBe(true)
    expect(rateLimit(key, 2, 1_000).allowed).toBe(true)
    expect(rateLimit(key, 2, 1_000).allowed).toBe(false)

    vi.setSystemTime(BASE + 1_000)
    const after = rateLimit(key, 2, 1_000)
    expect(after.allowed).toBe(true)
    expect(after.remaining).toBe(1)
  })
})

describe('rateLimitBulk (in-memory fallback)', () => {
  it('consumes several slots in one call', () => {
    const r = rateLimitBulk('bulk', 3, 5, 1_000)
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(2)
    expect(r.resetIn).toBe(1)
  })

  it('denies a batch that would exceed the limit but leaves the bucket intact', () => {
    const key = 'bulk-partial'
    expect(rateLimitBulk(key, 3, 5, 1_000).allowed).toBe(true)

    const denied = rateLimitBulk(key, 3, 5, 1_000)
    expect(denied.allowed).toBe(false)
    expect(denied.remaining).toBe(2)

    // The rejected batch was not counted, so a batch that exactly fills the
    // remaining slots still succeeds.
    const fill = rateLimitBulk(key, 2, 5, 1_000)
    expect(fill.allowed).toBe(true)
    expect(fill.remaining).toBe(0)
  })

  it('denies a batch larger than the limit on an empty bucket with resetIn 0', () => {
    const big = rateLimitBulk('bulk-too-big', 10, 5, 1_000)
    expect(big.allowed).toBe(false)
    expect(big.remaining).toBe(5)
    expect(big.resetIn).toBe(0)
  })
})
