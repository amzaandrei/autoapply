'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Eye, MessageSquare, Send, Trophy, Mail, Building2, ExternalLink, Inbox } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface Stats {
  sent: number
  opened: number
  replied: number
  openRate: number
  replyRate: number
}

interface RepliedEmail {
  id: string
  companyName: string
  contactEmail: string | null
  subject: string
  body: string
  sentAt: string | null
  repliedAt: string | null
  variant: string | null
  gmailThreadId: string | null
}

interface AnalyticsData {
  overall: Stats
  variants: { A: Stats; B: Stats; hasData: boolean }
  byIndustry: Record<string, Stats>
  bySize: Record<string, Stats>
  repliedEmails: RepliedEmail[]
}

function StatsBreakdownTable({
  title,
  columnLabel,
  data,
}: {
  title: string
  columnLabel: string
  data: Record<string, Stats>
}) {
  if (Object.keys(data).length <= 1) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-left">
              <th className="pb-2 font-medium">{columnLabel}</th>
              <th className="pb-2 font-medium text-center">Sent</th>
              <th className="pb-2 font-medium text-center">Open %</th>
              <th className="pb-2 font-medium text-center">Reply %</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(data).map(([key, stats]) => (
              <tr key={key} className="border-b border-border/40 last:border-0">
                <td className="py-2">{key}</td>
                <td className="py-2 text-center">{stats.sent}</td>
                <td className="py-2 text-center">{stats.openRate}%</td>
                <td className="py-2 text-center">{stats.replyRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

export function CampaignAnalytics({ campaignId }: { campaignId: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadAnalytics() {
      // Auto-check for replies first
      try {
        await fetch('/api/gmail/check-replies', { method: 'POST' })
      } catch {
        // Non-blocking
      }

      // Then load analytics
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/analytics`)
        setData(await res.json())
      } catch {
        // Silent
      } finally {
        setLoading(false)
      }
    }
    void loadAnalytics()
  }, [campaignId])

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Stat cards skeleton */}
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-6 space-y-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
        {/* Table skeleton */}
        <div className="rounded-lg border p-6 space-y-3">
          <Skeleton className="h-5 w-40" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3 py-2">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (!data || data.overall.sent === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <p className="font-medium">No tracking data yet.</p>
          <p className="text-sm mt-1">Analytics will appear after you send emails and they get opened or replied to.</p>
        </CardContent>
      </Card>
    )
  }

  const winnerVariant = data.variants.hasData
    ? data.variants.A.replyRate > data.variants.B.replyRate ? 'A'
      : data.variants.B.replyRate > data.variants.A.replyRate ? 'B'
      : null
    : null

  return (
    <div className="space-y-6">
      {/* Overall stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Send className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{data.overall.sent}</p>
                <p className="text-sm text-muted-foreground">Sent</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Eye className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{data.overall.openRate}%</p>
                <p className="text-sm text-muted-foreground">Open rate ({data.overall.opened})</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{data.overall.replyRate}%</p>
                <p className="text-sm text-muted-foreground">Reply rate ({data.overall.replied})</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Replied emails */}
      {data.repliedEmails.length > 0 && (
        <Card className="border-green-500/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-green-500" />
                Replies Received ({data.repliedEmails.length})
              </CardTitle>
              <Button asChild size="sm" variant="outline">
                <Link href={`/campaigns/${campaignId}/inbox`}>
                  <Inbox className="h-3.5 w-3.5 mr-1" /> Open Inbox
                </Link>
              </Button>
            </div>
            <CardDescription>Companies that responded to your application.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.repliedEmails.map((email) => (
              <div key={email.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{email.companyName}</span>
                    {email.variant && (
                      <Badge variant="outline" className="text-[10px]">Variant {email.variant}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {email.sentAt && (
                      <span>Sent {new Date(email.sentAt).toLocaleDateString()}</span>
                    )}
                    {email.repliedAt && (
                      <Badge className="bg-green-100 text-green-700 border-green-300 text-[10px]">
                        Replied {new Date(email.repliedAt).toLocaleDateString()}
                      </Badge>
                    )}
                  </div>
                </div>
                {email.contactEmail && (
                  <p className="text-xs text-muted-foreground">
                    <Mail className="inline h-3 w-3 mr-1" />
                    {email.contactEmail}
                  </p>
                )}
                <Separator />
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    Your email: {email.subject}
                  </p>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed text-muted-foreground/80 max-h-[120px] overflow-y-auto">
                    {email.body.slice(0, 500)}{email.body.length > 500 ? '...' : ''}
                  </p>
                </div>
                {email.gmailThreadId && (
                  <Link
                    href={`/campaigns/${campaignId}/inbox?thread=${email.gmailThreadId}`}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" /> View full conversation
                  </Link>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* A/B comparison */}
      {data.variants.hasData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">A/B Test Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {(['A', 'B'] as const).map((v) => {
                const stats = data.variants[v]
                const isWinner = winnerVariant === v
                return (
                  <div
                    key={v}
                    className={`rounded-lg border p-4 space-y-2 ${isWinner ? 'border-green-500 bg-green-50/30 dark:bg-green-950/10' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Variant {v}</span>
                      {isWinner && (
                        <Badge className="bg-green-100 text-green-700 border-green-300 text-[10px]">
                          <Trophy className="h-3 w-3 mr-0.5" /> Winner
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold">{stats.sent}</p>
                        <p className="text-[11px] text-muted-foreground">Sent</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold">{stats.openRate}%</p>
                        <p className="text-[11px] text-muted-foreground">Open rate</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold">{stats.replyRate}%</p>
                        <p className="text-[11px] text-muted-foreground">Reply rate</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <StatsBreakdownTable title="By Industry" columnLabel="Industry" data={data.byIndustry} />
      <StatsBreakdownTable title="By Company Size" columnLabel="Size" data={data.bySize} />
    </div>
  )
}
