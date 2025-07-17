'use client'

import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts'
import { Loader2, TrendingUp, DollarSign, Sparkles, Users } from 'lucide-react'
import type { AdminStatsResponse } from '@/app/api/admin/stats/route'

export function AdminCharts() {
  const [data, setData] = useState<AdminStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await fetch('/api/admin/stats')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as AdminStatsResponse
        if (mounted) setData(json)
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load stats')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  if (loading) {
    return (
      <div className="border rounded-xl bg-card p-12 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="border border-destructive/40 bg-destructive/10 text-destructive rounded-xl p-4 text-sm">
        Failed to load charts{error ? `: ${error}` : ''}
      </div>
    )
  }

  const usd = (n: number) => `$${n.toFixed(2)}`
  const netProfit =
    data.currentMrr - (data.monthlySpend[data.monthlySpend.length - 1]?.totalCost ?? 0)

  return (
    <div className="space-y-6">
      {/* Headline KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="MRR"
          value={usd(data.currentMrr)}
          sub={`${data.payingUsers} paying`}
          icon={<DollarSign className="w-4 h-4 text-green-600" />}
        />
        <Kpi
          label="Total users"
          value={data.totalUsers.toLocaleString()}
          sub={`${data.payingUsers} paid · S${data.payingByTier.starter} / P${data.payingByTier.pro} / X${data.payingByTier.power}`}
          icon={<Users className="w-4 h-4 text-blue-600" />}
        />
        <Kpi
          label="Spend this month"
          value={usd(data.monthlySpend[data.monthlySpend.length - 1]?.totalCost ?? 0)}
          sub="Hunter + Anthropic"
          icon={<TrendingUp className="w-4 h-4 text-orange-600" />}
        />
        <Kpi
          label="Est. net this month"
          value={usd(netProfit)}
          sub={netProfit >= 0 ? 'in the black' : 'losing money'}
          icon={<Sparkles className="w-4 h-4 text-primary" />}
          positive={netProfit >= 0}
        />
      </div>

      {/* Row 1 — Signup charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard
          title="User growth (last 30 days)"
          subtitle="Cumulative — total users vs paid users"
        >
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data.signups}>
              <defs>
                <linearGradient id="g-users" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="g-paid" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#eab308" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis dataKey="date" tickFormatter={shortDate} fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="cumulativeUsers"
                name="Total users"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#g-users)"
              />
              <Area
                type="monotone"
                dataKey="cumulativePaid"
                name="Paid users"
                stroke="#eab308"
                strokeWidth={2}
                fill="url(#g-paid)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Daily new signups (last 30 days)"
          subtitle="Daily acquisition — free vs paid"
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.signups}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis dataKey="date" tickFormatter={shortDate} fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="users" name="New users" stackId="s" fill="#3b82f6" />
              <Bar dataKey="paid" name="New paid" stackId="s" fill="#eab308" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 2 — Paid signups by tier + revenue run-rate */}
      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard
          title="Monthly paid signups by tier (last 6 months)"
          subtitle={`Starter $${data.costConstants.tierPricesUsd.STARTER} · Pro $${data.costConstants.tierPricesUsd.PRO} · Power $${data.costConstants.tierPricesUsd.POWER}`}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.monthlyPaidSignups}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis dataKey="month" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="starter" stackId="t" name="Starter" fill="#3b82f6" />
              <Bar dataKey="pro" stackId="t" name="Pro" fill="#eab308" />
              <Bar dataKey="power" stackId="t" name="Power" fill="#a855f7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Estimated monthly revenue run-rate"
          subtitle="Cumulative signups × per-tier price (simplified)"
        >
          <ResponsiveContainer width="100%" height={240}>
            <LineChart
              data={data.monthlyPaidSignups.reduce<Array<{ month: string; revenue: number }>>(
                (acc, cur, i) => {
                  const prior = i > 0 ? acc[i - 1].revenue : 0
                  const monthRevenue =
                    cur.starter * data.costConstants.tierPricesUsd.STARTER +
                    cur.pro * data.costConstants.tierPricesUsd.PRO +
                    cur.power * data.costConstants.tierPricesUsd.POWER
                  acc.push({ month: cur.month, revenue: prior + monthRevenue })
                  return acc
                },
                [],
              )}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis dataKey="month" fontSize={11} />
              <YAxis tickFormatter={(v) => `$${v}`} fontSize={11} />
              <Tooltip
                formatter={(v) => (typeof v === 'number' ? usd(v) : String(v))}
                labelClassName="text-xs"
                contentStyle={tooltipStyle}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                name="Revenue"
                stroke="#22c55e"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 3 — API spend */}
      <ChartCard
        title="API spend by month (last 6 months)"
        subtitle={`Hunter @ $${data.costConstants.perHunterRequestUsd}/req · Anthropic @ $${data.costConstants.perMillionInputTokensUsd}/M in · $${data.costConstants.perMillionOutputTokensUsd}/M out`}
      >
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data.monthlySpend}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis dataKey="month" fontSize={11} />
            <YAxis tickFormatter={(v) => `$${v}`} fontSize={11} />
            <Tooltip
              formatter={(v) => (typeof v === 'number' ? usd(v) : String(v ?? ''))}
              contentStyle={tooltipStyle}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="hunterCost" stackId="cost" name="Hunter" fill="#10b981" />
            <Bar dataKey="anthropicCost" stackId="cost" name="Anthropic" fill="#a855f7" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-4 text-xs">
          <MiniStat label="Hunter reqs (all time)" value={data.allTimeHunterRequests.toLocaleString()} />
          <MiniStat label="Hunter spend (all time)" value={usd(data.allTimeHunterCostUsd)} />
          <MiniStat label="AI gens (all time)" value={data.allTimeAiGenerations.toLocaleString()} />
          <MiniStat label="Input tokens (all time)" value={compactNum(data.allTimeAiInputTokens)} />
          <MiniStat label="Output tokens (all time)" value={compactNum(data.allTimeAiOutputTokens)} />
          <MiniStat label="Anthropic spend (all time)" value={usd(data.allTimeAiCostUsd)} />
        </div>
      </ChartCard>
    </div>
  )
}

function Kpi({
  label,
  value,
  sub,
  icon,
  positive,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  positive?: boolean
}) {
  return (
    <div className="border rounded-xl p-4 bg-card">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div
        className={`text-2xl font-semibold mt-1 ${
          positive === false ? 'text-red-600 dark:text-red-400' : ''
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  )
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="border rounded-xl bg-card p-4">
      <div className="mb-3">
        <h3 className="font-semibold text-sm">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}

function compactNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString()
}

function shortDate(iso: string): string {
  // '2026-04-20' → 'Apr 20'
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])))
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const tooltipStyle: React.CSSProperties = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '0.5rem',
  fontSize: 12,
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="bg-card border rounded-lg p-2.5 shadow-sm text-xs">
      <div className="font-medium mb-1">{label ? shortDate(label) : ''}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  )
}
