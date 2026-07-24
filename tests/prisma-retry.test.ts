import { describe, expect, it, vi } from 'vitest'

// Keep the import hermetic: lib/prisma.ts constructs a pg Pool + PrismaClient at
// module scope. Stub those so importing never needs a generated client, a
// DATABASE_URL, or a real socket. withDbRetry itself is pure and is what we test.
vi.mock('pg', () => ({ Pool: class {} }))
vi.mock('@prisma/adapter-pg', () => ({ PrismaPg: class {} }))
vi.mock('@prisma/client', () => ({ PrismaClient: class {} }))

import { withDbRetry } from '@/lib/prisma'

const noDelay = { baseDelayMs: 0 }

describe('withDbRetry', () => {
  it('returns immediately when the operation succeeds', async () => {
    const fn = vi.fn(async () => 'ok')
    await expect(withDbRetry(fn, noDelay)).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries a transient error (P1001) and then resolves', async () => {
    let calls = 0
    const fn = vi.fn(async () => {
      calls += 1
      if (calls <= 2) throw Object.assign(new Error("Can't reach database server"), { code: 'P1001' })
      return 'recovered'
    })
    await expect(withDbRetry(fn, { retries: 3, baseDelayMs: 0 })).resolves.toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('treats a socket-level code (ECONNRESET) as transient', async () => {
    let calls = 0
    const fn = vi.fn(async () => {
      calls += 1
      if (calls === 1) throw Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })
      return 42
    })
    await expect(withDbRetry(fn, noDelay)).resolves.toBe(42)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('treats PrismaClientInitializationError (by name) as transient', async () => {
    let calls = 0
    const fn = vi.fn(async () => {
      calls += 1
      if (calls === 1) {
        const err = new Error('init failed')
        err.name = 'PrismaClientInitializationError'
        throw err
      }
      return 'up'
    })
    await expect(withDbRetry(fn, noDelay)).resolves.toBe('up')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('treats a message-only transient failure ("socket hang up") as transient', async () => {
    let calls = 0
    const fn = vi.fn(async () => {
      calls += 1
      if (calls === 1) throw new Error('socket hang up')
      return 'done'
    })
    await expect(withDbRetry(fn, noDelay)).resolves.toBe('done')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('does NOT retry a non-transient error and surfaces it immediately', async () => {
    const fn = vi.fn(async () => {
      throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    })
    await expect(withDbRetry(fn, noDelay)).rejects.toThrow('Unique constraint failed')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('gives up after exhausting retries on a persistent transient error', async () => {
    const fn = vi.fn(async () => {
      throw Object.assign(new Error('connection terminated'), { code: 'P1002' })
    })
    // retries: 2 -> attempts 0,1,2 = 3 total before giving up.
    await expect(withDbRetry(fn, { retries: 2, baseDelayMs: 0 })).rejects.toThrow('connection terminated')
    expect(fn).toHaveBeenCalledTimes(3)
  })
})
