/**
 * Global daily cost circuit breaker for the Anthropic API. Prevents runaway
 * spend from bugs or abuse. Tracks cents in Redis; falls back to no-op when
 * REDIS_URL is unset (local dev).
 *
 * Usage:
 *   await ensureCostBudget('anthropic', estimateCents)  // throws if exceeded
 *   await recordCost('anthropic', actualCents)
 */
import { redis } from './redis'

function todayKey(provider: string): string {
  const d = new Date()
  const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  return `cost:${provider}:${iso}`
}

function capCents(provider: string): number {
  switch (provider) {
    case 'anthropic':
      return Math.round((Number(process.env.ANTHROPIC_DAILY_USD_CAP ?? '50')) * 100)
    case 'hunter':
      return Math.round((Number(process.env.HUNTER_DAILY_USD_CAP ?? '5')) * 100)
    case 'rapidapi':
      return Math.round((Number(process.env.RAPIDAPI_DAILY_USD_CAP ?? '10')) * 100)
    default:
      return 100_000 // $1000 sentinel
  }
}

export class CostCapExceeded extends Error {
  constructor(public provider: string, public spentCents: number, public capCents: number) {
    super(`Daily cost cap exceeded for ${provider}: $${(spentCents / 100).toFixed(2)} / $${(capCents / 100).toFixed(2)}`)
    this.name = 'CostCapExceeded'
  }
}

export async function ensureCostBudget(
  provider: 'anthropic' | 'hunter' | 'rapidapi',
  estimateCents: number,
): Promise<void> {
  if (!redis) return
  const key = todayKey(provider)
  const currentStr = await redis.get(key)
  const current = currentStr ? parseInt(currentStr, 10) : 0
  const cap = capCents(provider)
  if (current + estimateCents > cap) {
    throw new CostCapExceeded(provider, current, cap)
  }
}

export async function recordCost(
  provider: 'anthropic' | 'hunter' | 'rapidapi',
  cents: number,
): Promise<number> {
  if (!redis || cents <= 0) return 0
  const key = todayKey(provider)
  const total = await redis.incrby(key, cents)
  // TTL ~26h to ensure rollover even with time-zone drift
  if (total === cents) await redis.expire(key, 26 * 60 * 60)
  return total
}
