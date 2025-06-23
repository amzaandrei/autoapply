'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Loader2, Sparkles } from 'lucide-react'
import { FREE_TIER, PRO_TIER } from '@/lib/tier-limits'

interface UsageStats {
  emailsSentThisMonth: number
  aiGenerationsThisMonth: number
  discoveriesThisHour: number
  campaigns: number
}

interface SubscriptionInfo {
  tier: 'FREE' | 'PRO'
  status: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

function BillingContent() {
  const { data: session, status, update } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [sub, setSub] = useState<SubscriptionInfo | null>(null)
  const [usage, setUsage] = useState<UsageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'checkout' | 'portal' | null>(null)
  const bannerShown = useRef(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    if (bannerShown.current) return
    if (searchParams.get('success') === '1') {
      bannerShown.current = true
      ;(async () => {
        // Pull latest subscription state from Stripe directly (no webhook wait).
        try {
          await fetch('/api/billing/sync', { method: 'POST' })
        } catch {
          // non-fatal — webhook will catch up eventually
        }
        toast.success('Upgrade successful — welcome to Pro!')
        // Force a full reload so NextAuth regenerates the JWT with the new
        // tier on the next request. `update()` alone isn't enough — we want
        // every server component to re-render against the new session.
        window.location.replace('/billing')
      })()
    } else if (searchParams.get('canceled') === '1') {
      bannerShown.current = true
      toast('Checkout canceled.')
      router.replace('/billing')
    }
    // Intentionally NOT depending on `update` — its identity changes every time
    // the session refreshes, which would otherwise cause an infinite loop here.
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

  async function handleUpgrade() {
    setBusy('checkout')
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' })
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

  const isPro = sub?.tier === 'PRO'
  const percent = (v: number, limit: number) =>
    Number.isFinite(limit) ? Math.min(100, Math.round((v / limit) * 100)) : 0

  return (
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
                {isPro && <Sparkles className="w-5 h-5 text-yellow-500" />}
                {sub?.tier ?? 'FREE'}
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
                <div className="text-sm text-orange-600 mt-1">
                  Cancels at period end.
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {!isPro && (
                <button
                  disabled={busy === 'checkout'}
                  onClick={handleUpgrade}
                  className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
                >
                  {busy === 'checkout' && <Loader2 className="w-4 h-4 animate-spin" />}
                  Upgrade to Pro
                </button>
              )}
              {isPro && (
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
          </div>
        </section>

        {/* Usage */}
        {usage && (
          <section className="border rounded-xl p-6 bg-card space-y-4">
            <h2 className="font-semibold">Usage this month</h2>
            <UsageBar
              label="Emails sent"
              value={usage.emailsSentThisMonth}
              limit={isPro ? PRO_TIER.emailsPerMonth : FREE_TIER.emailsPerMonth}
              percent={percent(
                usage.emailsSentThisMonth,
                isPro ? PRO_TIER.emailsPerMonth : FREE_TIER.emailsPerMonth,
              )}
            />
            <UsageBar
              label="AI generations"
              value={usage.aiGenerationsThisMonth}
              limit={
                isPro ? PRO_TIER.aiGenerationsPerMonth : FREE_TIER.aiGenerationsPerMonth
              }
              percent={percent(
                usage.aiGenerationsThisMonth,
                isPro ? PRO_TIER.aiGenerationsPerMonth : FREE_TIER.aiGenerationsPerMonth,
              )}
            />
            <UsageBar
              label="Campaigns"
              value={usage.campaigns}
              limit={isPro ? PRO_TIER.maxCampaigns : FREE_TIER.maxCampaigns}
              percent={percent(
                usage.campaigns,
                isPro ? PRO_TIER.maxCampaigns : FREE_TIER.maxCampaigns,
              )}
            />
          </section>
        )}

        {/* Plan comparison */}
        <section className="grid md:grid-cols-2 gap-4">
          <PlanCard
            name="Free"
            price="$0"
            current={!isPro}
            features={[
              `${FREE_TIER.maxCampaigns} campaigns`,
              `${FREE_TIER.emailsPerMonth} emails/month`,
              `${FREE_TIER.aiGenerationsPerMonth} AI generations/month`,
              `${FREE_TIER.discoveriesPerHour} discoveries/hour`,
              'Basic email templates',
            ]}
          />
          <PlanCard
            name="Pro"
            price="$19/month"
            current={isPro}
            highlighted
            features={[
              'Unlimited campaigns',
              'Unlimited emails',
              'Unlimited AI generations',
              `${PRO_TIER.discoveriesPerHour} discoveries/hour`,
              'A/B testing',
              'Auto follow-ups',
              'Priority support',
            ]}
          />
        </section>
    </div>
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
  name,
  price,
  features,
  current,
  highlighted,
}: {
  name: string
  price: string
  features: string[]
  current?: boolean
  highlighted?: boolean
}) {
  return (
    <div
      className={`border rounded-xl p-6 ${highlighted ? 'border-primary bg-primary/5' : 'bg-card'}`}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">{name}</h3>
        {current && (
          <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">
            Current
          </span>
        )}
      </div>
      <div className="text-3xl font-bold mt-2">{price}</div>
      <ul className="mt-4 space-y-2 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="w-4 h-4 mt-0.5 text-green-600 flex-shrink-0" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function BillingPage() {
  return (
    <Suspense fallback={null}>
      <BillingContent />
    </Suspense>
  )
}
