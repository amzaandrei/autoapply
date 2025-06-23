/**
 * Redis singleton. In dev, REDIS_URL is optional — callers must handle the
 * null case by falling back to in-memory behaviour (see lib/rate-limit.ts).
 * In production, we expect REDIS_URL to be set (docker-compose provides it).
 */
import IORedis, { type Redis } from 'ioredis'

const globalForRedis = globalThis as unknown as { redis: Redis | null }

function createClient(): Redis | null {
  const url = process.env.REDIS_URL
  if (!url) return null
  const client = new IORedis(url, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: true,
    lazyConnect: false,
  })
  client.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[redis] error', err.message)
  })
  return client
}

export const redis: Redis | null =
  globalForRedis.redis ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis

export function hasRedis(): boolean {
  return !!redis
}
