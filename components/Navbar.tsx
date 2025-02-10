'use client'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function Navbar() {
  const { data: session } = useSession()
  if (!session?.user) return null
  return (
    <header className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="font-semibold text-lg">AutoApply</Link>
        <div className="flex items-center gap-3">
          {session.user.image && <img src={session.user.image} className="w-7 h-7 rounded-full" alt="" />}
          <span className="text-sm text-muted-foreground">{session.user.name ?? session.user.email}</span>
          <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: '/login' })}>Sign out</Button>
        </div>
      </div>
    </header>
  )
}
