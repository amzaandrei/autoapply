import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adapter = new PrismaPg(pool as unknown as any)

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Cold containers (and post-restart Hetzner deploys) routinely fail the very
// first DB query while the pg.Pool is still negotiating its first TCP/TLS
// handshake. Those failures bubble up as NextAuth `Configuration` errors or
// uncaught server errors — refreshing "fixes" it because the pool is warm by
// then. Retry the small set of error codes that indicate a transient
// connection problem; real query errors still surface immediately.
function isTransientDbError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; message?: string; name?: string }
  if (e.name === 'PrismaClientInitializationError') return true
  const code = e.code ?? ''
  if (
    [
      'P1001', // Can't reach database server
      'P1002', // Database server timed out
      'P1008', // Operations timed out
      'P1017', // Server closed the connection
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'EAI_AGAIN',
    ].includes(code)
  ) {
    return true
  }
  const msg = e.message ?? ''
  return /can'?t reach database|connection terminated|connection refused|connection closed|timeout|socket hang up/i.test(
    msg,
  )
}

export async function withDbRetry<T>(
  fn: () => Promise<T>,
  { retries = 2, baseDelayMs = 100 }: { retries?: number; baseDelayMs?: number } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= retries || !isTransientDbError(err)) throw err
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt))
    }
  }
}
