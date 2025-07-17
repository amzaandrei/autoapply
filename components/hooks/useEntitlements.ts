'use client'

import { useSession } from 'next-auth/react'
import { hasTierAtLeast, type Tier } from '@/lib/tier-limits'

export function useEntitlements() {
  const { data: session, status } = useSession()
  const tier = (session?.user?.tier ?? 'FREE') as Tier
  return {
    tier,
    // `isPro` historically meant "has access to PRO-gated features" — preserve that
    // by treating POWER as also satisfying it, since POWER is strictly above PRO.
    isPro: hasTierAtLeast(tier, 'PRO'),
    isFree: tier === 'FREE',
    isPaid: tier !== 'FREE',
    loading: status === 'loading',
  }
}
