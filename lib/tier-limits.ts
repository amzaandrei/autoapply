/**
 * Plan limits as pure data — no server imports, safe for client components.
 * Server-side helpers (getTier, checkQuota, incrementUsage, requirePro,
 * getUsage) live in `lib/entitlements.ts`.
 *
 * Caps are sized so that worst-case per-user Anthropic + Hunter cost stays
 * comfortably below the plan price. See `app/api/admin/stats/route.ts` for
 * the cost model used to derive these numbers.
 */

export type Tier = 'FREE' | 'STARTER' | 'PRO' | 'POWER'

export interface TierLimits {
  maxCampaigns: number
  emailsPerMonth: number
  aiGenerationsPerMonth: number
  discoveriesPerHour: number
  discoveriesPerMonth: number
  companiesPerDiscovery: number
  hunterRequestsPerMonth: number
  followupsEnabled: boolean
  maxFollowUpSequences: number
  abTestingEnabled: boolean
  cvTailoringEnabled: boolean
  prioritySupport: boolean
}

export const FREE_TIER: TierLimits = {
  maxCampaigns: 3,
  emailsPerMonth: 10,
  aiGenerationsPerMonth: 20,
  discoveriesPerHour: 3,
  discoveriesPerMonth: 5,
  companiesPerDiscovery: 10,
  hunterRequestsPerMonth: 10,
  followupsEnabled: false,
  maxFollowUpSequences: 0,
  abTestingEnabled: false,
  cvTailoringEnabled: false,
  prioritySupport: false,
}

export const STARTER_TIER: TierLimits = {
  maxCampaigns: 10,
  emailsPerMonth: 75,
  aiGenerationsPerMonth: 150,
  discoveriesPerHour: 5,
  discoveriesPerMonth: 15,
  companiesPerDiscovery: 20,
  hunterRequestsPerMonth: 50,
  followupsEnabled: true,
  maxFollowUpSequences: 1,
  abTestingEnabled: false,
  cvTailoringEnabled: false,
  prioritySupport: false,
}

export const PRO_TIER: TierLimits = {
  maxCampaigns: 50,
  emailsPerMonth: 250,
  aiGenerationsPerMonth: 500,
  discoveriesPerHour: 10,
  discoveriesPerMonth: 40,
  companiesPerDiscovery: 25,
  hunterRequestsPerMonth: 150,
  followupsEnabled: true,
  maxFollowUpSequences: 3,
  abTestingEnabled: true,
  cvTailoringEnabled: false,
  prioritySupport: false,
}

export const POWER_TIER: TierLimits = {
  maxCampaigns: 200,
  emailsPerMonth: 800,
  aiGenerationsPerMonth: 1500,
  discoveriesPerHour: 20,
  discoveriesPerMonth: 100,
  companiesPerDiscovery: 40,
  hunterRequestsPerMonth: 500,
  followupsEnabled: true,
  maxFollowUpSequences: 5,
  abTestingEnabled: true,
  cvTailoringEnabled: true,
  prioritySupport: true,
}

export const TIER_PRICES_USD: Record<Tier, number> = {
  FREE: 0,
  STARTER: 9,
  PRO: 19,
  POWER: 49,
}

export type UsageAction =
  | 'email_sent'
  | 'ai_generation'
  | 'discovery'
  | 'follow_up'
  | 'hunter_request'
  | 'ai_input_tokens'
  | 'ai_output_tokens'

export function limitsFor(tier: Tier): TierLimits {
  switch (tier) {
    case 'POWER':
      return POWER_TIER
    case 'PRO':
      return PRO_TIER
    case 'STARTER':
      return STARTER_TIER
    case 'FREE':
    default:
      return FREE_TIER
  }
}

/**
 * Tier rank — higher means more capable. Use when you need to say
 * "the user's tier is at least X" (e.g. `tierRank(user.tier) >= tierRank('PRO')`).
 */
export function tierRank(tier: Tier): number {
  switch (tier) {
    case 'POWER':
      return 3
    case 'PRO':
      return 2
    case 'STARTER':
      return 1
    case 'FREE':
    default:
      return 0
  }
}

/**
 * Everything at or above this tier. Used for gating paid-only features
 * like autopilot that should be available to any paying user, not just PRO.
 */
export function hasTierAtLeast(userTier: Tier, required: Tier): boolean {
  return tierRank(userTier) >= tierRank(required)
}
