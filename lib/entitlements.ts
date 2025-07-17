/**
 * Server-side entitlement helpers. Imports prisma — do NOT import this from
 * client components. For pure limit constants, use `lib/tier-limits.ts`.
 */
import { prisma } from './prisma'
import { TRPCError } from '@trpc/server'
import {
  FREE_TIER,
  STARTER_TIER,
  PRO_TIER,
  POWER_TIER,
  limitsFor,
  tierRank,
  hasTierAtLeast,
  type Tier,
  type TierLimits,
  type UsageAction,
} from './tier-limits'

// Re-export constants so existing `import { FREE_TIER } from '@/lib/entitlements'`
// calls keep working on the server side.
export { FREE_TIER, STARTER_TIER, PRO_TIER, POWER_TIER, limitsFor, tierRank, hasTierAtLeast }
export type { Tier, TierLimits, UsageAction }

function currentMonth(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function currentHour(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCHours()).padStart(2, '0')}`
}

function periodFor(action: UsageAction): string {
  return action === 'discovery' ? currentHour() : currentMonth()
}

export async function getTier(userId: string): Promise<Tier> {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { tier: true, status: true },
  })
  if (!sub) return 'FREE'
  const active = sub.status === 'ACTIVE' || sub.status === 'TRIALING'
  if (!active) return 'FREE'
  // Prisma enum values map 1:1 to our Tier union.
  return sub.tier as Tier
}

export async function getEntitlements(userId: string): Promise<TierLimits & { tier: Tier }> {
  const tier = await getTier(userId)
  return { tier, ...limitsFor(tier) }
}

function limitForAction(tier: Tier, action: UsageAction): number {
  const l = limitsFor(tier)
  switch (action) {
    case 'email_sent':
      return l.emailsPerMonth
    case 'ai_generation':
      return l.aiGenerationsPerMonth
    case 'discovery':
      return l.discoveriesPerHour
    case 'follow_up':
      return l.followupsEnabled ? Number.POSITIVE_INFINITY : 0
    case 'hunter_request':
      return l.hunterRequestsPerMonth
    case 'ai_input_tokens':
    case 'ai_output_tokens':
      return Number.POSITIVE_INFINITY
  }
}

export interface QuotaResult {
  allowed: boolean
  remaining: number
  limit: number
  tier: Tier
}

export async function checkQuota(
  userId: string,
  action: UsageAction,
  increment = 1,
): Promise<QuotaResult> {
  const tier = await getTier(userId)
  const limit = limitForAction(tier, action)
  if (!Number.isFinite(limit)) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, limit, tier }
  }
  const period = periodFor(action)
  const row = await prisma.usageCounter.findUnique({
    where: { userId_action_period: { userId, action, period } },
    select: { count: true },
  })
  const current = row?.count ?? 0
  const allowed = current + increment <= limit
  return { allowed, remaining: Math.max(0, limit - current), limit, tier }
}

export async function incrementUsage(
  userId: string,
  action: UsageAction,
  by = 1,
): Promise<void> {
  const period = periodFor(action)
  await prisma.usageCounter.upsert({
    where: { userId_action_period: { userId, action, period } },
    create: { userId, action, period, count: by },
    update: { count: { increment: by } },
  })
}

export async function requirePro(userId: string, featureLabel = 'This feature'): Promise<void> {
  const tier = await getTier(userId)
  if (!hasTierAtLeast(tier, 'PRO')) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `${featureLabel} requires a Pro subscription.`,
    })
  }
}

export async function requirePaid(userId: string, featureLabel = 'This feature'): Promise<void> {
  const tier = await getTier(userId)
  if (!hasTierAtLeast(tier, 'STARTER')) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `${featureLabel} requires a paid plan (Starter, Pro, or Power).`,
    })
  }
}

export async function getUsage(userId: string): Promise<{
  emailsSentThisMonth: number
  aiGenerationsThisMonth: number
  discoveriesThisHour: number
  hunterRequestsThisMonth: number
  campaigns: number
}> {
  const [emailsRow, aiRow, discRow, hunterRow, campaigns] = await Promise.all([
    prisma.usageCounter.findUnique({
      where: { userId_action_period: { userId, action: 'email_sent', period: currentMonth() } },
      select: { count: true },
    }),
    prisma.usageCounter.findUnique({
      where: { userId_action_period: { userId, action: 'ai_generation', period: currentMonth() } },
      select: { count: true },
    }),
    prisma.usageCounter.findUnique({
      where: { userId_action_period: { userId, action: 'discovery', period: currentHour() } },
      select: { count: true },
    }),
    prisma.usageCounter.findUnique({
      where: { userId_action_period: { userId, action: 'hunter_request', period: currentMonth() } },
      select: { count: true },
    }),
    prisma.campaign.count({ where: { userId } }),
  ])
  return {
    emailsSentThisMonth: emailsRow?.count ?? 0,
    aiGenerationsThisMonth: aiRow?.count ?? 0,
    discoveriesThisHour: discRow?.count ?? 0,
    hunterRequestsThisMonth: hunterRow?.count ?? 0,
    campaigns,
  }
}
