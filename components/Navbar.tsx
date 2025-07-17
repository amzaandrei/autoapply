'use client'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Settings, LogOut, ChevronDown, Flame, CreditCard, Sparkles, Shield } from 'lucide-react'

// Paths that are part of the marketing site (public). Everything else is the app.
const MARKETING_PATHS = ['/', '/pricing']

export function Navbar() {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const isMarketing = MARKETING_PATHS.includes(pathname)

  // On auth pages (login/signup), hide navbar entirely
  if (pathname === '/login' || pathname === '/signup') return null

  // Marketing pages get the public nav, regardless of auth state
  if (isMarketing) {
    return <PublicNavbar signedIn={!!session?.user} loading={status === 'loading'} />
  }

  // App pages: authenticated nav only — return null if not signed in
  if (!session?.user) return null
  return <AppNavbar session={session} />
}

function PublicNavbar({ signedIn, loading }: { signedIn: boolean; loading: boolean }) {
  return (
    <header className="border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
          <Sparkles className="h-5 w-5 text-primary" />
          AutoApply
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <Link href="/#features" className="hover:text-foreground transition-colors">
            Features
          </Link>
          <Link href="/#how-it-works" className="hover:text-foreground transition-colors">
            How it works
          </Link>
          <Link href="/pricing" className="hover:text-foreground transition-colors">
            Pricing
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          {loading ? null : signedIn ? (
            <Link
              href="/dashboard"
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Go to app
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

type AppTier = 'FREE' | 'STARTER' | 'PRO' | 'POWER'

function tierBadge(tier: AppTier | undefined): { label: string; color: string } | null {
  switch (tier) {
    case 'STARTER':
      return { label: 'Starter', color: 'text-blue-600' }
    case 'PRO':
      return { label: 'Pro', color: 'text-yellow-600' }
    case 'POWER':
      return { label: 'Power', color: 'text-purple-600' }
    default:
      return null
  }
}

function AppNavbar({ session }: { session: { user: { name?: string | null; email?: string | null; image?: string | null; tier?: AppTier; isAdmin?: boolean } } }) {
  const badge = tierBadge(session.user.tier)
  const isPaid = session.user.tier && session.user.tier !== 'FREE'
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
                {isPaid ? (
                  <Sparkles className="h-4 w-4 mr-2 text-yellow-500" />
                ) : (
                  <CreditCard className="h-4 w-4 mr-2" />
                )}
                Billing
                {badge && (
                  <span className={`ml-auto text-xs ${badge.color}`}>{badge.label}</span>
                )}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/profile" className="cursor-pointer">
                <Settings className="h-4 w-4 mr-2" /> Settings
              </Link>
            </DropdownMenuItem>
            {session.user.isAdmin && (
              <DropdownMenuItem asChild>
                <Link href="/admin" className="cursor-pointer">
                  <Shield className="h-4 w-4 mr-2 text-primary" /> Admin
                </Link>
              </DropdownMenuItem>
            )}
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
