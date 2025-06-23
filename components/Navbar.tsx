'use client'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Settings, LogOut, ChevronDown, Flame, CreditCard, Sparkles } from 'lucide-react'

export function Navbar() {
  const { data: session } = useSession()
  if (!session?.user) return null
  return (
    <header className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="font-semibold text-lg">AutoApply</Link>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 hover:opacity-80 transition-opacity outline-none">
            {session.user.image && <img src={session.user.image} className="w-7 h-7 rounded-full" alt="" />}
            <span className="text-sm text-muted-foreground">{session.user.name ?? session.user.email}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href="/coverage" className="cursor-pointer">
                <Flame className="h-4 w-4 mr-2" /> Coverage
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/billing" className="cursor-pointer">
                {session.user.tier === 'PRO' ? (
                  <Sparkles className="h-4 w-4 mr-2 text-yellow-500" />
                ) : (
                  <CreditCard className="h-4 w-4 mr-2" />
                )}
                Billing
                {session.user.tier === 'PRO' && (
                  <span className="ml-auto text-xs text-yellow-600">Pro</span>
                )}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/profile" className="cursor-pointer">
                <Settings className="h-4 w-4 mr-2" /> Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-destructive focus:text-destructive"
              onClick={() => signOut({ callbackUrl: '/login' })}
            >
              <LogOut className="h-4 w-4 mr-2" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
