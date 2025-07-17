import 'next-auth'
import 'next-auth/jwt'
import type { Tier } from '@/lib/tier-limits'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      tier: Tier
      isAdmin: boolean
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    tier?: Tier
    isAdmin?: boolean
  }
}
