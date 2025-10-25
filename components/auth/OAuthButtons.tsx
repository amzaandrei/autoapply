'use client'

import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'

export function OAuthButtons({ callbackUrl = '/dashboard' }: { callbackUrl?: string }) {
  return (
    <div className="mt-4 space-y-2">
      <Button variant="outline" className="w-full" onClick={() => signIn('google', { callbackUrl })}>
        Continue with Google
      </Button>
      <Button variant="outline" className="w-full" onClick={() => signIn('linkedin', { callbackUrl })}>
        Continue with LinkedIn
      </Button>
    </div>
  )
}
