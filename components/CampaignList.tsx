'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { MoreHorizontal, ArrowRight, Send, Inbox, Kanban, BarChart3, Download, Trash2, Layers, PenSquare, CalendarDays, X } from 'lucide-react'
import { StaggerItem } from '@/components/Motion'
import { SaveTemplateDialog } from '@/components/SaveTemplateDialog'
import { trpc } from '@/lib/trpc'
import { toast } from 'sonner'

type Campaign = {
  id: string
  name: string
  status: string
  sentCount: number
  createdAt: Date | string
  updatedAt: Date | string
  _count: {
    companies: number
    emails: number
  }
}

function formatRelativeDate(date: Date | string): string {
  const d = new Date(date)
  const diffMs = Date.now() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const statusDotColor: Record<string, string> = {
  DRAFT: 'bg-muted-foreground/50',
  ACTIVE: 'bg-green-500',
  PAUSED: 'bg-amber-500',
  COMPLETED: 'bg-blue-500',
  ARCHIVED: 'bg-muted-foreground/30',
}

function formatCampaignName(name: string): string {
  // "Full Stack Developer, Backend Developer, Frontend Developer, iOS Developer"
  // → "Full Stack + 3 more"
  const roles = name.split(',').map((r) => r.trim()).filter(Boolean)
  if (roles.length <= 1) return name
  if (roles.length === 2) return roles.join(' · ')
  return `${roles[0]} + ${roles.length - 1} more`
}

const PAGE_SIZE = 5

// YYYY-MM-DD key in local TZ (so "today" matches what the user sees on their clock)
function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function shiftDay(base: Date, delta: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + delta)
  d.setHours(0, 0, 0, 0)
  return d
}

function pillLabel(d: Date, todayKey: string, yesterdayKey: string): string {
  const key = localDateKey(d)
  if (key === todayKey) return 'Today'
  if (key === yesterdayKey) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric' })
}

export default function CampaignList({
  campaigns: initialCampaigns,
  sentDatesByCampaign = {},
}: {
  campaigns: Campaign[]
  sentDatesByCampaign?: Record<string, string[]>
}) {
  const [campaigns, setCampaigns] = useState(initialCampaigns)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saveTemplateCampaignId, setSaveTemplateCampaignId] = useState<string | null>(null)

  // Bucket sent-email ISO strings into per-campaign local-date keys (memoized
  // so we don't re-parse every render)
  const sentDayKeysByCampaign = useMemo(() => {
    const out: Record<string, Set<string>> = {}
    for (const [cid, isoList] of Object.entries(sentDatesByCampaign)) {
      const set = new Set<string>()
      for (const iso of isoList) set.add(localDateKey(new Date(iso)))
      out[cid] = set
    }
    return out
  }, [sentDatesByCampaign])

  const allActivityDays = useMemo(() => {
    const set = new Set<string>()
    for (const s of Object.values(sentDayKeysByCampaign)) {
      for (const d of s) set.add(d)
    }
    return set
  }, [sentDayKeysByCampaign])

  const hasAnyActivity = allActivityDays.size > 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayKey = localDateKey(today)
  const yesterdayKey = localDateKey(shiftDay(today, -1))

  // Default: today. null = "All dates" escape hatch so the user can reset.
  const [filterDate, setFilterDate] = useState<string | null>(todayKey)

  const pillDays = useMemo(
    () => [-3, -2, -1, 0].map((delta) => shiftDay(today, delta)),
    // today is re-derived every render but the key doesn't change within a day
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayKey],
  )

  const filteredCampaigns = useMemo(() => {
    if (!filterDate) return campaigns
    return campaigns.filter((c) => sentDayKeysByCampaign[c.id]?.has(filterDate))
  }, [campaigns, filterDate, sentDayKeysByCampaign])

  const activeDayCount = filterDate ? filteredCampaigns.length : campaigns.length
  const saveFromCampaign = trpc.templates.saveFromCampaign.useMutation({
    onSuccess: () => toast.success('Template saved'),
    onError: (e) => toast.error(e.message),
  })

  async function handleDelete() {
    if (!deleteId) return
    const targetId = deleteId
    const campaign = campaigns.find((c) => c.id === targetId)
    if (!campaign) return

    // Optimistic removal
    setCampaigns((prev) => prev.filter((c) => c.id !== targetId))
    setDeleteId(null)

    // Give the user 5 seconds to undo before hitting the API
    let cancelled = false
    const timer = setTimeout(async () => {
      if (cancelled) return
      try {
        await fetch(`/api/campaigns/${targetId}`, { method: 'DELETE' })
      } catch {
        // Silent — already optimistically removed
      }
    }, 5000)

    toast(`Campaign "${campaign.name.slice(0, 40)}${campaign.name.length > 40 ? '…' : ''}" deleted`, {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: () => {
          cancelled = true
          clearTimeout(timer)
          setCampaigns((prev) => [campaign, ...prev])
          toast.success('Campaign restored')
        },
      },
    })
  }

  if (campaigns.length === 0) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h2 className="text-lg font-semibold">Recent Campaigns</h2>

        {hasAnyActivity && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
            {pillDays.map((d) => {
              const key = localDateKey(d)
              const active = filterDate === key
              const hasActivity = allActivityDays.has(key)
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilterDate(active ? null : key)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'hover:border-primary/50 text-muted-foreground'
                  }`}
                  title={d.toLocaleDateString([], {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                  })}
                >
                  {pillLabel(d, todayKey, yesterdayKey)}
                  {hasActivity && !active && (
                    <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" />
                  )}
                </button>
              )
            })}
            <input
              type="date"
              value={filterDate ?? ''}
              onChange={(e) => setFilterDate(e.target.value || null)}
              max={todayKey}
              className="text-xs px-2 py-1 rounded-md border bg-background hover:border-primary/50 transition-colors"
            />
            {filterDate && (
              <button
                type="button"
                onClick={() => setFilterDate(null)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                title="Clear filter"
              >
                <X className="h-3 w-3" /> All
              </button>
            )}
          </div>
        )}
      </div>

      {filterDate && (
        <p className="text-xs text-muted-foreground mb-3">
          {activeDayCount === 0
            ? `No campaigns sent on ${new Date(filterDate + 'T00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}.`
            : `Showing ${activeDayCount} campaign${activeDayCount === 1 ? '' : 's'} with emails sent on ${new Date(filterDate + 'T00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })}.`}
        </p>
      )}

      <div className="space-y-2">
        {filteredCampaigns.slice(0, visibleCount).map((campaign, idx) => {
          // Pick the most relevant next action
          const primaryHref =
            campaign._count.emails === 0
              ? `/generate?campaignId=${campaign.id}`
              : campaign.sentCount === 0
                ? `/review?campaignId=${campaign.id}`
                : `/send?campaignId=${campaign.id}`
          const displayName = formatCampaignName(campaign.name)

          return (
            <StaggerItem key={campaign.id} index={idx}>
              <Link
                href={primaryHref}
                className="block group"
              >
                <Card className="hover:border-primary/50 transition-colors">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {/* Status dot */}
                      <div
                        className={`h-2 w-2 rounded-full shrink-0 ${statusDotColor[campaign.status] ?? statusDotColor.DRAFT}`}
                        title={campaign.status.toLowerCase()}
                      />

                      {/* Name + stats */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <p className="font-medium text-sm truncate" title={campaign.name}>{displayName}</p>
                          <span className="text-[11px] text-muted-foreground shrink-0" title={new Date(campaign.createdAt).toLocaleString()}>
                            · {formatRelativeDate(campaign.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {campaign._count.companies} companies
                          {campaign._count.emails > 0 && ` · ${campaign._count.emails} emails`}
                          {campaign.sentCount > 0 && ` · ${campaign.sentCount} sent`}
                        </p>
                      </div>

                      {/* Arrow + dropdown */}
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 shrink-0"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.preventDefault()}>
                          <DropdownMenuItem asChild>
                            <Link href={`/review?campaignId=${campaign.id}`} className="cursor-pointer">
                              <PenSquare className="h-4 w-4 mr-2" /> Review
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/send?campaignId=${campaign.id}`} className="cursor-pointer">
                              <Send className="h-4 w-4 mr-2" /> Send
                            </Link>
                          </DropdownMenuItem>
                          {campaign.sentCount > 0 && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild>
                                <Link href={`/campaigns/${campaign.id}/inbox`} className="cursor-pointer">
                                  <Inbox className="h-4 w-4 mr-2" /> Inbox
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/campaigns/${campaign.id}/interviews`} className="cursor-pointer">
                                  <Kanban className="h-4 w-4 mr-2" /> Pipeline
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/campaigns/${campaign.id}/analytics`} className="cursor-pointer">
                                  <BarChart3 className="h-4 w-4 mr-2" /> Analytics
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <a href={`/api/campaigns/${campaign.id}/export`} download className="cursor-pointer">
                                  <Download className="h-4 w-4 mr-2" /> Export CSV
                                </a>
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => setSaveTemplateCampaignId(campaign.id)}
                          >
                            <Layers className="h-4 w-4 mr-2" /> Save as Template
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer text-destructive focus:text-destructive"
                            onClick={() => setDeleteId(campaign.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </StaggerItem>
          )
        })}
      </div>

      {filteredCampaigns.length > PAGE_SIZE && (
        <div className="flex justify-center mt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setVisibleCount(
                visibleCount >= filteredCampaigns.length ? PAGE_SIZE : visibleCount + PAGE_SIZE,
              )
            }
          >
            {visibleCount >= filteredCampaigns.length
              ? 'Show less'
              : `Show ${Math.min(PAGE_SIZE, filteredCampaigns.length - visibleCount)} more (${filteredCampaigns.length - visibleCount} remaining)`}
          </Button>
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all emails and company data for this campaign.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SaveTemplateDialog
        open={!!saveTemplateCampaignId}
        onOpenChange={(o) => { if (!o) setSaveTemplateCampaignId(null) }}
        defaultName={campaigns.find((c) => c.id === saveTemplateCampaignId)?.name ?? ''}
        onSave={async (name) => {
          if (!saveTemplateCampaignId) return
          await saveFromCampaign.mutateAsync({
            campaignId: saveTemplateCampaignId,
            name,
          })
        }}
      />
    </div>
  )
}
