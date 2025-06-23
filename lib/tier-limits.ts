/**
 * Plan limits as pure data — no server imports, safe for client components.
 * Server-side helpers (getTier, checkQuota, incrementUsage, requirePro,
 * getUsage) live in `lib/entitlements.ts`.
 */

export type Tier = 'FREE' | 'PRO'

export interface TierLimits {
  maxCampaigns: number
  emailsPerMonth: number
  aiGenerationsPerMonth: number
  discoveriesPerHour: number
  followupsEnabled: boolean
  abTestingEnabled: boolean
}

export const FREE_TIER: TierLimits = {
  maxCampaigns: 3,
  emailsPerMonth: 20,
  aiGenerationsPerMonth: 50,
  discoveriesPerHour: 5,
  followupsEnabled: false,
  abTestingEnabled: false,
}

export const PRO_TIER: TierLimits = {
  maxCampaigns: Number.POSITIVE_INFINITY,
  emailsPerMonth: Number.POSITIVE_INFINITY,
  aiGenerationsPerMonth: Number.POSITIVE_INFINITY,
  discoveriesPerHour: 30,
  followupsEnabled: true,
  abTestingEnabled: true,
}

export type UsageAction = 'email_sent' | 'ai_generation' | 'discovery' | 'follow_up'

export function limitsFor(tier: Tier): TierLimits {
  return tier === 'PRO' ? PRO_TIER : FREE_TIER
}
