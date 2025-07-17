import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin'
import type { Tier } from '@/lib/tier-limits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function currentMonth(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function currentHour(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCHours()).padStart(2, '0')}`
}

export interface AdminUsageRow {
  userId: string
  email: string
  name: string | null
  createdAt: string
  tier: Tier
  subscriptionStatus: string | null
  emailsSentThisMonth: number
  aiGenerationsThisMonth: number
  discoveriesThisHour: number
  discoveriesThisMonth: number
  hunterRequestsThisMonth: number
  campaigns: number
  emailsSentLifetime: number
  repliedLifetime: number
}

export interface AdminUsageResponse {
  period: string
  rows: AdminUsageRow[]
  totals: {
    users: number
    paidUsers: number
    starterUsers: number
    proUsers: number
    powerUsers: number
    hunterRequestsThisMonth: number
    emailsSentThisMonth: number
    aiGenerationsThisMonth: number
  }
}

export async function GET() {
  try {
    await requireAdmin()
  } catch (err) {
    const status = err instanceof Error && err.message === 'Forbidden' ? 403 : 401
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unauthorized' }, { status })
  }

  const month = currentMonth()
  const hour = currentHour()

  // One query per dimension; join in memory. Acceptable for dashboard scale
  // (hundreds of users) and avoids fragile ORM tricks.
  const [users, subs, monthCounters, hourCounters, campaignCounts, emailCounts] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, email: true, name: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.subscription.findMany({
      select: { userId: true, tier: true, status: true },
    }),
    prisma.usageCounter.findMany({
      where: { period: month },
      select: { userId: true, action: true, count: true },
    }),
    prisma.usageCounter.findMany({
      where: { period: hour, action: 'discovery' },
      select: { userId: true, count: true },
    }),
    prisma.campaign.groupBy({
      by: ['userId'],
      _count: { _all: true },
    }),
    prisma.generatedEmail.groupBy({
      by: ['campaignId', 'status'],
      _count: { _all: true },
      where: { status: { in: ['SENT', 'OPENED', 'REPLIED'] } },
    }),
  ])

  // Map campaignId -> userId (for lifetime email rollup)
  const campaignToUser = new Map<string, string>()
  const allCampaigns = await prisma.campaign.findMany({ select: { id: true, userId: true } })
  for (const c of allCampaigns) campaignToUser.set(c.id, c.userId)

  // Lifetime sent + replied per user
  const lifetimeSent = new Map<string, number>()
  const lifetimeReplied = new Map<string, number>()
  for (const row of emailCounts) {
    const userId = campaignToUser.get(row.campaignId)
    if (!userId) continue
    if (row.status === 'SENT' || row.status === 'OPENED' || row.status === 'REPLIED') {
      lifetimeSent.set(userId, (lifetimeSent.get(userId) ?? 0) + row._count._all)
    }
    if (row.status === 'REPLIED') {
      lifetimeReplied.set(userId, (lifetimeReplied.get(userId) ?? 0) + row._count._all)
    }
  }

  const subByUser = new Map(subs.map((s) => [s.userId, s]))
  const campaignCount = new Map(campaignCounts.map((c) => [c.userId, c._count._all]))

  // Pivot month counters: userId -> { action -> count }
  const monthByUser = new Map<string, Record<string, number>>()
  for (const row of monthCounters) {
    const bucket = monthByUser.get(row.userId) ?? {}
    bucket[row.action] = row.count
    monthByUser.set(row.userId, bucket)
  }
  const hourByUser = new Map(hourCounters.map((h) => [h.userId, h.count]))

  const rows: AdminUsageRow[] = users.map((u) => {
    const sub = subByUser.get(u.id)
    const m = monthByUser.get(u.id) ?? {}
    const active = sub && (sub.status === 'ACTIVE' || sub.status === 'TRIALING')
    const tier: Tier = active ? (sub.tier as Tier) : 'FREE'
    return {
      userId: u.id,
      email: u.email,
      name: u.name,
      createdAt: u.createdAt.toISOString(),
      tier,
      subscriptionStatus: sub?.status ?? null,
      emailsSentThisMonth: m['email_sent'] ?? 0,
      aiGenerationsThisMonth: m['ai_generation'] ?? 0,
      discoveriesThisHour: hourByUser.get(u.id) ?? 0,
      discoveriesThisMonth: m['discovery'] ?? 0,
      hunterRequestsThisMonth: m['hunter_request'] ?? 0,
      campaigns: campaignCount.get(u.id) ?? 0,
      emailsSentLifetime: lifetimeSent.get(u.id) ?? 0,
      repliedLifetime: lifetimeReplied.get(u.id) ?? 0,
    }
  })

  const totals = {
    users: rows.length,
    paidUsers: rows.filter((r) => r.tier !== 'FREE').length,
    starterUsers: rows.filter((r) => r.tier === 'STARTER').length,
    proUsers: rows.filter((r) => r.tier === 'PRO').length,
    powerUsers: rows.filter((r) => r.tier === 'POWER').length,
    hunterRequestsThisMonth: rows.reduce((s, r) => s + r.hunterRequestsThisMonth, 0),
    emailsSentThisMonth: rows.reduce((s, r) => s + r.emailsSentThisMonth, 0),
    aiGenerationsThisMonth: rows.reduce((s, r) => s + r.aiGenerationsThisMonth, 0),
  }

  const payload: AdminUsageResponse = { period: month, rows, totals }
  return NextResponse.json(payload)
}
