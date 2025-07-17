import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin'
import { TIER_PRICES_USD, type Tier } from '@/lib/tier-limits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Hunter Growth is flat $149/mo for 5k reqs → ~$0.03/req blended.
// Anthropic Sonnet 4.6 pricing (public list, Jan 2026): $3 per M input tokens,
// $15 per M output tokens. Cache reads/writes are folded into input_tokens at
// the recordAnthropicUsage call site, which is close enough for cost reporting.
const COST_PER_HUNTER_REQUEST_USD = 0.03
const COST_PER_MILLION_INPUT_TOKENS_USD = 3
const COST_PER_MILLION_OUTPUT_TOKENS_USD = 15

function tokenCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * COST_PER_MILLION_INPUT_TOKENS_USD +
    (outputTokens / 1_000_000) * COST_PER_MILLION_OUTPUT_TOKENS_USD
  )
}

export interface AdminStatsResponse {
  signups: Array<{ date: string; users: number; paid: number; cumulativeUsers: number; cumulativePaid: number }>
  monthlyPaidSignups: Array<{ month: string; starter: number; pro: number; power: number; total: number }>
  monthlySpend: Array<{
    month: string
    hunterRequests: number
    aiGenerations: number
    aiInputTokens: number
    aiOutputTokens: number
    hunterCost: number
    anthropicCost: number
    totalCost: number
  }>
  currentMrr: number
  payingUsers: number
  payingByTier: { starter: number; pro: number; power: number }
  totalUsers: number
  allTimeHunterRequests: number
  allTimeAiGenerations: number
  allTimeAiInputTokens: number
  allTimeAiOutputTokens: number
  allTimeHunterCostUsd: number
  allTimeAiCostUsd: number
  costConstants: {
    perHunterRequestUsd: number
    perMillionInputTokensUsd: number
    perMillionOutputTokensUsd: number
    tierPricesUsd: Record<Tier, number>
  }
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function dayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function lastNMonths(n: number): string[] {
  const out: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    out.push(monthKey(d))
  }
  return out
}

function lastNDays(n: number): string[] {
  const out: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i))
    out.push(dayKey(d))
  }
  return out
}

export async function GET() {
  try {
    await requireAdmin()
  } catch (err) {
    const status = err instanceof Error && err.message === 'Forbidden' ? 403 : 401
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unauthorized' }, { status })
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6)
  sixMonthsAgo.setUTCDate(1)

  const sixMonthsStr = lastNMonths(6)

  const [users, subs, monthCounters, recentPaidSubs] = await Promise.all([
    // Users for signup chart (last 30 days)
    prisma.user.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { id: true, createdAt: true },
    }),
    // All subscriptions — we'll filter active/paid in memory since the enum
    // can't be narrowed nicely in a Prisma where clause across 3 tiers.
    prisma.subscription.findMany({
      select: { userId: true, tier: true, status: true, createdAt: true },
    }),
    // Usage counters for last 6 months for spend chart
    prisma.usageCounter.findMany({
      where: { period: { in: sixMonthsStr } },
      select: { action: true, period: true, count: true },
    }),
    // Paid subscription signups for last 6 months (all tiers except FREE)
    prisma.subscription.findMany({
      where: { tier: { not: 'FREE' }, createdAt: { gte: sixMonthsAgo } },
      select: { tier: true, createdAt: true },
    }),
  ])

  // All-time stats from a single grouped query (cheap)
  const allTimeCounters = await prisma.usageCounter.groupBy({
    by: ['action'],
    _sum: { count: true },
  })
  const allTimeSums = new Map(
    allTimeCounters.map((c) => [c.action, c._sum.count ?? 0]),
  )

  // Users before the 30-day window (so cumulative totals start from the right base)
  const usersBeforeWindow = await prisma.user.count({
    where: { createdAt: { lt: thirtyDaysAgo } },
  })
  const isActive = (status: string) => status === 'ACTIVE' || status === 'TRIALING'
  const activePaidSubs = subs.filter((s) => s.tier !== 'FREE' && isActive(s.status))
  const activePaidSet = new Set(activePaidSubs.map((s) => s.userId))
  const paidBeforeWindow = activePaidSubs.filter((s) => s.createdAt < thirtyDaysAgo).length

  // ─── Daily signups (last 30d) ───────────────────────────────────────────────
  const usersByDay = new Map<string, number>()
  const paidByDay = new Map<string, number>()
  for (const u of users) {
    const key = dayKey(u.createdAt)
    usersByDay.set(key, (usersByDay.get(key) ?? 0) + 1)
    if (activePaidSet.has(u.id)) {
      paidByDay.set(key, (paidByDay.get(key) ?? 0) + 1)
    }
  }
  let runningUsers = usersBeforeWindow
  let runningPaid = paidBeforeWindow
  const signups = lastNDays(30).map((d) => {
    const u = usersByDay.get(d) ?? 0
    const p = paidByDay.get(d) ?? 0
    runningUsers += u
    runningPaid += p
    return { date: d, users: u, paid: p, cumulativeUsers: runningUsers, cumulativePaid: runningPaid }
  })

  // ─── Monthly paid signups by tier (last 6 months) ───────────────────────────
  const paidSignupsByMonth = new Map<string, { starter: number; pro: number; power: number }>()
  for (const m of sixMonthsStr) paidSignupsByMonth.set(m, { starter: 0, pro: 0, power: 0 })
  for (const s of recentPaidSubs) {
    const key = monthKey(s.createdAt)
    const bucket = paidSignupsByMonth.get(key)
    if (!bucket) continue
    if (s.tier === 'STARTER') bucket.starter += 1
    else if (s.tier === 'PRO') bucket.pro += 1
    else if (s.tier === 'POWER') bucket.power += 1
  }
  const monthlyPaidSignups = sixMonthsStr.map((m) => {
    const b = paidSignupsByMonth.get(m)!
    return { month: m, ...b, total: b.starter + b.pro + b.power }
  })

  // ─── Monthly spend (last 6 months) ──────────────────────────────────────────
  const spendByMonth = new Map<
    string,
    { hunter: number; ai: number; aiInput: number; aiOutput: number }
  >()
  for (const m of sixMonthsStr) {
    spendByMonth.set(m, { hunter: 0, ai: 0, aiInput: 0, aiOutput: 0 })
  }
  for (const c of monthCounters) {
    const bucket = spendByMonth.get(c.period)
    if (!bucket) continue
    if (c.action === 'hunter_request') bucket.hunter += c.count
    else if (c.action === 'ai_generation') bucket.ai += c.count
    else if (c.action === 'ai_input_tokens') bucket.aiInput += c.count
    else if (c.action === 'ai_output_tokens') bucket.aiOutput += c.count
  }
  const monthlySpend = sixMonthsStr.map((m) => {
    const b = spendByMonth.get(m)!
    const hunterCost = b.hunter * COST_PER_HUNTER_REQUEST_USD
    const anthropicCost = tokenCostUsd(b.aiInput, b.aiOutput)
    return {
      month: m,
      hunterRequests: b.hunter,
      aiGenerations: b.ai,
      aiInputTokens: b.aiInput,
      aiOutputTokens: b.aiOutput,
      hunterCost: Math.round(hunterCost * 100) / 100,
      anthropicCost: Math.round(anthropicCost * 100) / 100,
      totalCost: Math.round((hunterCost + anthropicCost) * 100) / 100,
    }
  })

  // ─── MRR + headline stats ───────────────────────────────────────────────────
  const payingByTier = { starter: 0, pro: 0, power: 0 }
  let currentMrr = 0
  for (const s of activePaidSubs) {
    const tier = s.tier as Tier
    currentMrr += TIER_PRICES_USD[tier] ?? 0
    if (tier === 'STARTER') payingByTier.starter += 1
    else if (tier === 'PRO') payingByTier.pro += 1
    else if (tier === 'POWER') payingByTier.power += 1
  }
  const payingUsers = activePaidSubs.length
  const totalUsers = usersBeforeWindow + users.length

  const allTimeHunter = allTimeSums.get('hunter_request') ?? 0
  const allTimeAi = allTimeSums.get('ai_generation') ?? 0
  const allTimeAiInput = allTimeSums.get('ai_input_tokens') ?? 0
  const allTimeAiOutput = allTimeSums.get('ai_output_tokens') ?? 0

  const payload: AdminStatsResponse = {
    signups,
    monthlyPaidSignups,
    monthlySpend,
    currentMrr,
    payingUsers,
    payingByTier,
    totalUsers,
    allTimeHunterRequests: allTimeHunter,
    allTimeAiGenerations: allTimeAi,
    allTimeAiInputTokens: allTimeAiInput,
    allTimeAiOutputTokens: allTimeAiOutput,
    allTimeHunterCostUsd: Math.round(allTimeHunter * COST_PER_HUNTER_REQUEST_USD * 100) / 100,
    allTimeAiCostUsd: Math.round(tokenCostUsd(allTimeAiInput, allTimeAiOutput) * 100) / 100,
    costConstants: {
      perHunterRequestUsd: COST_PER_HUNTER_REQUEST_USD,
      perMillionInputTokensUsd: COST_PER_MILLION_INPUT_TOKENS_USD,
      perMillionOutputTokensUsd: COST_PER_MILLION_OUTPUT_TOKENS_USD,
      tierPricesUsd: TIER_PRICES_USD,
    },
  }
  return NextResponse.json(payload)
}
