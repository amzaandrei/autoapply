'use client'

import { useSession } from 'next-auth/react'

export function useEntitlements() {
  const { data: session, status } = useSession()
  const tier = (session?.user?.tier ?? 'FREE') as 'FREE' | 'PRO'
  return {
    tier,
    isPro: tier === 'PRO',
    isFree: tier === 'FREE',
    loading: status === 'loading',
  }
}
