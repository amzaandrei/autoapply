'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Loader2, Sparkles, Zap, Rocket } from 'lucide-react'
import {
  FREE_TIER,
  STARTER_TIER,
  PRO_TIER,
  POWER_TIER,
  TIER_PRICES_USD,
  limitsFor,
  tierRank,
  type Tier,
  type TierLimits,
} from '@/lib/tier-limits'
import { PageTransition, Stagger } from '@/components/Motion'

interface UsageStats {
  emailsSentThisMonth: number
  aiGenerationsThisMonth: number
  discoveriesThisHour: number
  hunterRequestsThisMonth: number
  campaigns: number
}

interface SubscriptionInfo {
  tier: Tier
  status: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

type PaidPlan = 'STARTER' | 'PRO' | 'POWER'

const PLAN_META: Record<Tier, { name: string; icon: React.ReactNode; limits: TierLimits }> = {
  FREE: { name: 'Free', icon: null, limits: FREE_TIER },
  STARTER: { name: 'Starter', icon: <Zap className="w-4 h-4 text-blue-500" />, limits: STARTER_TIER },
  PRO: { name: 'Pro', icon: <Sparkles className="w-4 h-4 text-yellow-500" />, limits: PRO_TIER },
  POWER: { name: 'Power', icon: <Rocket className="w-4 h-4 text-purple-500" />, limits: POWER_TIER },
}

function BillingContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [sub, setSub] = useState<SubscriptionInfo | null>(null)
  const [usage, setUsage] = useState<UsageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<PaidPlan | 'portal' | null>(null)
  const bannerShown = useRef(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    if (bannerShown.current) return
    if (searchParams.get('success') === '1') {
      bannerShown.current = true
      ;(async () => {
        try {
          await fetch('/api/billing/sync', { method: 'POST' })
        } catch {
          // non-fatal — webhook will catch up eventually
        }
        toast.success('Upgrade successful — welcome aboard!')
        window.location.replace('/billing')
      })()
    } else if (searchParams.get('canceled') === '1') {
      bannerShown.current = true
      toast('Checkout canceled.')
      router.replace('/billing')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router])

  useEffect(() => {
    if (!session?.user?.id) return
    let mounted = true
    ;(async () => {
      try {
        const res = await fetch('/api/billing/info')
        if (!res.ok) throw new Error('Failed to load billing info')
        const data = await res.json()
        if (!mounted) return
        setSub(data.subscription)
        setUsage(data.usage)
      } catch (err) {
        console.error(err)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [session?.user?.id])

  async function handleUpgrade(plan: PaidPlan) {
    setBusy(plan)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Checkout failed')
      window.location.href = data.url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Checkout failed')
      setBusy(null)
    }
  }

  async function handlePortal() {
    setBusy('portal')
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Portal unavailable')
      window.location.href = data.url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Portal unavailable')
      setBusy(null)
    }
  }

  if (loading || status === 'loading') {
    return (
      <div className="max-w-5xl mx-auto p-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const currentTier: Tier = sub?.tier ?? 'FREE'
  const currentLimits = limitsFor(currentTier)
  const currentMeta = PLAN_META[currentTier]
  const isPaid = currentTier !== 'FREE'
  const percent = (v: number, limit: number) =>
    Number.isFinite(limit) ? Math.min(100, Math.round((v / limit) * 100)) : 0

  return (
    <PageTransition>
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <header>
        <h1 className="text-3xl font-semibold">Billing & Plan</h1>
        <p className="text-muted-foreground mt-1">
          Manage your subscription and track usage.
        </p>
      </header>

      {/* Current plan */}
      <section className="border rounded-xl p-6 bg-card">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Current plan</div>
            <div className="text-2xl font-semibold mt-1 flex items-center gap-2">
              {currentMeta.icon}
              {currentMeta.name}
              <span className="text-base text-muted-foreground font-normal">
                · ${TIER_PRICES_USD[currentTier]}/mo
              </span>
            </div>
            {sub?.status && (
              <div className="text-sm text-muted-foreground mt-1">
                Status: <span className="font-medium">{sub.status}</span>
                {sub.currentPeriodEnd && (
                  <> · Renews {new Date(sub.currentPeriodEnd).toLocaleDateString()}</>
                )}
              </div>
            )}
            {sub?.cancelAtPeriodEnd && (
              <div className="text-sm text-orange-600 mt-1">Cancels at period end.</div>
            )}
          </div>
          {isPaid && (
            <button
              disabled={busy === 'portal'}
              onClick={handlePortal}
              className="px-4 py-2 rounded-md border font-medium hover:bg-accent disabled:opacity-60 flex items-center gap-2"
            >
              {busy === 'portal' && <Loader2 className="w-4 h-4 animate-spin" />}
              Manage subscription
            </button>
          )}
        </div>
      </section>

      {/* Usage */}
      {usage && (
        <section className="border rounded-xl p-6 bg-card space-y-4">
          <h2 className="font-semibold">Usage this month</h2>
          <UsageBar
            label="Emails sent"
            value={usage.emailsSentThisMonth}
            limit={currentLimits.emailsPerMonth}
            percent={percent(usage.emailsSentThisMonth, currentLimits.emailsPerMonth)}
          />
          <UsageBar
            label="AI generations"
            value={usage.aiGenerationsThisMonth}
            limit={currentLimits.aiGenerationsPerMonth}
            percent={percent(usage.aiGenerationsThisMonth, currentLimits.aiGenerationsPerMonth)}
          />
          <UsageBar
            label="Email verifications"
            value={usage.hunterRequestsThisMonth}
            limit={currentLimits.hunterRequestsPerMonth}
            percent={percent(usage.hunterRequestsThisMonth, currentLimits.hunterRequestsPerMonth)}
          />
          <UsageBar
            label="Campaigns"
            value={usage.campaigns}
            limit={currentLimits.maxCampaigns}
            percent={percent(usage.campaigns, currentLimits.maxCampaigns)}
          />
        </section>
      )}

      {/* Plan switcher */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Switch plan</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {isPaid
            ? 'Upgrade takes effect immediately. Downgrades apply at the next billing period via the billing portal.'
            : 'Pick the plan that matches how hard you\'re job-hunting. Cancel anytime.'}
        </p>
        <Stagger className="grid md:grid-cols-2 lg:grid-cols-4 gap-3" baseDelay={0.05}>
          {(['FREE', 'STARTER', 'PRO', 'POWER'] as const).map((t) => (
            <PlanCard
              key={t}
              tier={t}
              currentTier={currentTier}
              busyPlan={busy}
              onUpgrade={handleUpgrade}
              onPortal={handlePortal}
            />
          ))}
        </Stagger>
      </section>
    </div>
    </PageTransition>
  )
}

function UsageBar({
  label,
  value,
  limit,
  percent,
}: {
  label: string
  value: number
  limit: number
  percent: number
}) {
  const limitText = Number.isFinite(limit) ? limit.toString() : '∞'
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {value} / {limitText}
        </span>
      </div>
      <div className="h-2 rounded-full bg-accent overflow-hidden">
        <div
          className={`h-full ${percent >= 90 ? 'bg-red-500' : percent >= 70 ? 'bg-orange-500' : 'bg-primary'}`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  )
}

function PlanCard({
  tier,
  currentTier,
  busyPlan,
  onUpgrade,
  onPortal,
}: {
  tier: Tier
  currentTier: Tier
  busyPlan: PaidPlan | 'portal' | null
  onUpgrade: (plan: PaidPlan) => void
  onPortal: () => void
}) {
  const meta = PLAN_META[tier]
  const price = TIER_PRICES_USD[tier]
  const isCurrent = tier === currentTier
  const isUpgrade = tierRank(tier) > tierRank(currentTier)
  const isDowngrade = tierRank(tier) < tierRank(currentTier)
  const isFree = tier === 'FREE'
  const isPro = tier === 'PRO'
  const isLoading = busyPlan === tier

  return (
    <div
      className={`border rounded-xl p-5 flex flex-col bg-card ${
        isPro ? 'border-primary/60 shadow-sm' : isCurrent ? 'border-foreground/20' : ''
      }`}
    >
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {meta.icon}
            <h3 className="font-semibold">{meta.name}</h3>
          </div>
          {isCurrent && (
            <span className="text-xs bg-foreground/10 px-2 py-0.5 rounded font-medium">
              Current
            </span>
          )}
          {isPro && !isCurrent && (
            <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded font-medium">
              Popular
            </span>
          )}
        </div>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-3xl font-semibold">${price}</span>
          <span className="text-sm text-muted-foreground">/month</span>
        </div>
        <ul className="mt-4 space-y-1.5 text-xs">
          <Feat>{meta.limits.emailsPerMonth} emails/mo</Feat>
          <Feat>{meta.limits.aiGenerationsPerMonth} AI gens/mo</Feat>
          <Feat>{meta.limits.discoveriesPerMonth} discoveries/mo</Feat>
          <Feat>{meta.limits.hunterRequestsPerMonth} verifications/mo</Feat>
          {meta.limits.followupsEnabled && (
            <Feat>Auto follow-ups ({meta.limits.maxFollowUpSequences}×)</Feat>
          )}
          {meta.limits.abTestingEnabled && <Feat>A/B testing</Feat>}
          {meta.limits.cvTailoringEnabled && <Feat>CV tailoring</Feat>}
          {meta.limits.prioritySupport && <Feat>Priority support</Feat>}
        </ul>
      </div>

      <div className="mt-5">
        {isCurrent ? (
          <button
            disabled
            className="w-full px-3 py-2 rounded-md border text-sm font-medium opacity-60 cursor-not-allowed"
          >
            Current plan
          </button>
        ) : isFree ? (
          <button
            disabled={busyPlan === 'portal'}
            onClick={onPortal}
            className="w-full px-3 py-2 rounded-md border text-sm font-medium hover:bg-accent disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {busyPlan === 'portal' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Downgrade
          </button>
        ) : isUpgrade ? (
          <button
            disabled={isLoading}
            onClick={() => onUpgrade(tier as PaidPlan)}
            className={`w-full px-3 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60 ${
              isPro
                ? 'bg-primary text-primary-foreground hover:opacity-90'
                : 'border hover:bg-accent'
            }`}
          >
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Upgrade to {meta.name}
          </button>
        ) : isDowngrade ? (
          <button
            disabled={busyPlan === 'portal'}
            onClick={onPortal}
            className="w-full px-3 py-2 rounded-md border text-sm font-medium hover:bg-accent disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {busyPlan === 'portal' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Downgrade
          </button>
        ) : null}
      </div>
    </div>
  )
}

function Feat({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-1.5">
      <Check className="w-3.5 h-3.5 mt-0.5 text-green-600 flex-shrink-0" />
      <span>{children}</span>
    </li>
  )
}

export default function BillingPage() {
  return (
    <Suspense fallback={null}>
      <BillingContent />
    </Suspense>
  )
}
