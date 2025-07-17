'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Sparkles, Users, Mail, Wand2, Shield, ArrowUpDown, Zap, Rocket } from 'lucide-react'
import {
  FREE_TIER,
  STARTER_TIER,
  PRO_TIER,
  POWER_TIER,
  type Tier,
  type TierLimits,
} from '@/lib/tier-limits'
import type { AdminUsageResponse, AdminUsageRow } from '@/app/api/admin/usage/route'
import { AdminCharts } from './AdminCharts'

const LIMITS_BY_TIER: Record<Tier, TierLimits> = {
  FREE: FREE_TIER,
  STARTER: STARTER_TIER,
  PRO: PRO_TIER,
  POWER: POWER_TIER,
}

type TierFilter = 'ALL' | Tier
const TIER_FILTERS: readonly TierFilter[] = ['ALL', 'FREE', 'STARTER', 'PRO', 'POWER'] as const

type SortKey =
  | 'email'
  | 'tier'
  | 'createdAt'
  | 'emailsSentThisMonth'
  | 'aiGenerationsThisMonth'
  | 'hunterRequestsThisMonth'
  | 'discoveriesThisMonth'
  | 'campaigns'
  | 'emailsSentLifetime'
  | 'repliedLifetime'

export function AdminUsageClient() {
  const [data, setData] = useState<AdminUsageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('hunterRequestsThisMonth')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [query, setQuery] = useState('')
  const [tierFilter, setTierFilter] = useState<TierFilter>('ALL')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await fetch('/api/admin/usage')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as AdminUsageResponse
        if (mounted) setData(json)
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const rows = useMemo(() => {
    if (!data) return []
    let out = data.rows.slice()
    if (tierFilter !== 'ALL') out = out.filter((r) => r.tier === tierFilter)
    if (query.trim()) {
      const q = query.toLowerCase()
      out = out.filter(
        (r) =>
          r.email.toLowerCase().includes(q) ||
          (r.name ?? '').toLowerCase().includes(q),
      )
    }
    out.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      let cmp: number
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
      else cmp = String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return out
  }, [data, query, tierFilter, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="border border-destructive/40 bg-destructive/10 text-destructive rounded-xl p-4">
          Failed to load admin data: {error}
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-2">
            <Shield className="w-7 h-7 text-primary" />
            Admin — Usage
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Period: <span className="font-mono">{data.period}</span> · Live snapshot of
            all user activity.
          </p>
        </div>
      </header>

      <AdminCharts />

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          This period at a glance
        </h2>
        <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatCard label="Users" value={data.totals.users} icon={<Users className="w-4 h-4" />} />
          <StatCard
            label="Starter"
            value={data.totals.starterUsers}
            icon={<Zap className="w-4 h-4 text-blue-500" />}
          />
          <StatCard
            label="Pro"
            value={data.totals.proUsers}
            icon={<Sparkles className="w-4 h-4 text-yellow-500" />}
          />
          <StatCard
            label="Power"
            value={data.totals.powerUsers}
            icon={<Rocket className="w-4 h-4 text-purple-500" />}
          />
          <StatCard
            label="Hunter reqs/mo"
            value={data.totals.hunterRequestsThisMonth}
            icon={<Shield className="w-4 h-4 text-green-600" />}
          />
          <StatCard
            label="Emails sent/mo"
            value={data.totals.emailsSentThisMonth}
            icon={<Mail className="w-4 h-4 text-blue-600" />}
          />
          <StatCard
            label="AI gens/mo"
            value={data.totals.aiGenerationsThisMonth}
            icon={<Wand2 className="w-4 h-4 text-purple-600" />}
          />
        </section>
      </div>

      <section className="flex items-center gap-3 flex-wrap">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by email or name"
          className="px-3 py-2 rounded-md border bg-background text-sm w-64"
        />
        <div className="flex items-center gap-1 text-sm">
          {TIER_FILTERS.map((t) => (
            <button
              key={t}
              onClick={() => setTierFilter(t)}
              className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                tierFilter === t
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'hover:bg-accent'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          {rows.length} of {data.rows.length} users
        </div>
      </section>

      <section className="border rounded-xl bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <Th onClick={() => toggleSort('email')} active={sortKey === 'email'} dir={sortDir}>
                User
              </Th>
              <Th onClick={() => toggleSort('tier')} active={sortKey === 'tier'} dir={sortDir}>
                Tier
              </Th>
              <Th
                onClick={() => toggleSort('hunterRequestsThisMonth')}
                active={sortKey === 'hunterRequestsThisMonth'}
                dir={sortDir}
                right
                title="Hunter verification requests this month"
              >
                Hunter
              </Th>
              <Th
                onClick={() => toggleSort('emailsSentThisMonth')}
                active={sortKey === 'emailsSentThisMonth'}
                dir={sortDir}
                right
                title="Emails sent this month"
              >
                Emails/mo
              </Th>
              <Th
                onClick={() => toggleSort('aiGenerationsThisMonth')}
                active={sortKey === 'aiGenerationsThisMonth'}
                dir={sortDir}
                right
                title="AI generations this month"
              >
                AI/mo
              </Th>
              <Th
                onClick={() => toggleSort('discoveriesThisMonth')}
                active={sortKey === 'discoveriesThisMonth'}
                dir={sortDir}
                right
                title="Discoveries this month"
              >
                Disc/mo
              </Th>
              <Th
                onClick={() => toggleSort('campaigns')}
                active={sortKey === 'campaigns'}
                dir={sortDir}
                right
              >
                Campaigns
              </Th>
              <Th
                onClick={() => toggleSort('emailsSentLifetime')}
                active={sortKey === 'emailsSentLifetime'}
                dir={sortDir}
                right
                title="All-time emails sent"
              >
                Sent
              </Th>
              <Th
                onClick={() => toggleSort('repliedLifetime')}
                active={sortKey === 'repliedLifetime'}
                dir={sortDir}
                right
                title="All-time replies received"
              >
                Replies
              </Th>
              <Th onClick={() => toggleSort('createdAt')} active={sortKey === 'createdAt'} dir={sortDir}>
                Joined
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row key={r.userId} r={r} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center p-8 text-muted-foreground">
                  No users match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string
  value: number
  icon: React.ReactNode
}) {
  return (
    <div className="border rounded-xl p-4 bg-card">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-semibold mt-1">{value.toLocaleString()}</div>
    </div>
  )
}

function Th({
  children,
  onClick,
  active,
  dir,
  right,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  active: boolean
  dir: 'asc' | 'desc'
  right?: boolean
  title?: string
}) {
  return (
    <th
      title={title}
      className={`px-3 py-2 font-medium cursor-pointer select-none hover:text-foreground transition-colors ${
        right ? 'text-right' : 'text-left'
      }`}
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <ArrowUpDown
          className={`w-3 h-3 ${active ? 'text-foreground' : 'text-muted-foreground/40'} ${
            active && dir === 'asc' ? 'rotate-180' : ''
          }`}
        />
      </span>
    </th>
  )
}

function TierBadge({ tier }: { tier: Tier }) {
  if (tier === 'STARTER') {
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30 rounded px-1.5 py-0.5">
        <Zap className="w-3 h-3" />
        STARTER
      </span>
    )
  }
  if (tier === 'PRO') {
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30 rounded px-1.5 py-0.5">
        <Sparkles className="w-3 h-3" />
        PRO
      </span>
    )
  }
  if (tier === 'POWER') {
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/30 rounded px-1.5 py-0.5">
        <Rocket className="w-3 h-3" />
        POWER
      </span>
    )
  }
  return <span className="text-xs text-muted-foreground">FREE</span>
}

function Row({ r }: { r: AdminUsageRow }) {
  const limits = LIMITS_BY_TIER[r.tier]
  const hunterLimit = limits.hunterRequestsPerMonth
  const emailLimit = limits.emailsPerMonth
  const aiLimit = limits.aiGenerationsPerMonth

  return (
    <tr className="border-t hover:bg-muted/30">
      <td className="px-3 py-2">
        <div className="font-medium">{r.name ?? '—'}</div>
        <div className="text-xs text-muted-foreground">{r.email}</div>
      </td>
      <td className="px-3 py-2">
        <TierBadge tier={r.tier} />
      </td>
      <QuotaCell value={r.hunterRequestsThisMonth} limit={hunterLimit} />
      <QuotaCell value={r.emailsSentThisMonth} limit={emailLimit} />
      <QuotaCell value={r.aiGenerationsThisMonth} limit={aiLimit} />
      <td className="px-3 py-2 text-right tabular-nums">{r.discoveriesThisMonth}</td>
      <td className="px-3 py-2 text-right tabular-nums">{r.campaigns}</td>
      <td className="px-3 py-2 text-right tabular-nums">{r.emailsSentLifetime}</td>
      <td className="px-3 py-2 text-right tabular-nums">{r.repliedLifetime}</td>
      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
        {new Date(r.createdAt).toLocaleDateString()}
      </td>
    </tr>
  )
}

function QuotaCell({ value, limit }: { value: number; limit: number }) {
  const pct = Math.min(100, Math.round((value / limit) * 100))
  const color =
    pct >= 90 ? 'text-red-600 dark:text-red-400'
    : pct >= 70 ? 'text-orange-600 dark:text-orange-400'
    : 'text-foreground'
  return (
    <td className="px-3 py-2 text-right">
      <div className={`tabular-nums font-medium ${color}`}>
        {value}
        <span className="text-muted-foreground font-normal text-xs"> / {limit}</span>
      </div>
    </td>
  )
}
