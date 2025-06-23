import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const checks = {
    status: 'ok' as 'ok' | 'degraded' | 'down',
    db: 'unknown' as 'up' | 'down' | 'unknown',
    redis: 'unknown' as 'up' | 'down' | 'skipped' | 'unknown',
    version: process.env.GIT_SHA ?? 'dev',
    timestamp: new Date().toISOString(),
  }

  try {
    await prisma.$queryRawUnsafe('SELECT 1')
    checks.db = 'up'
  } catch {
    checks.db = 'down'
    checks.status = 'down'
  }

  if (!redis) {
    checks.redis = 'skipped'
  } else {
    try {
      const pong = await redis.ping()
      checks.redis = pong === 'PONG' ? 'up' : 'down'
      if (checks.redis === 'down') checks.status = 'degraded'
    } catch {
      checks.redis = 'down'
      checks.status = 'degraded'
    }
  }

  const statusCode = checks.status === 'down' ? 503 : 200
  return NextResponse.json(checks, { status: statusCode })
}
