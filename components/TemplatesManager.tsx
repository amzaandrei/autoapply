'use client'

import { useState } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@/server/routers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Bot,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  Clock,
  History,
  MapPin,
  Play,
  Save,
  Zap,
} from 'lucide-react'

type Frequency = 'daily' | 'every2days' | 'weekly'
type Tone = 'concise' | 'balanced' | 'detailed'

const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: 'Every day',
  every2days: 'Every 2 days',
  weekly: 'Every week',
}

export function TemplatesManager() {
  const templates = trpc.templates.list.useQuery()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [consentFor, setConsentFor] = useState<string | null>(null)

  const list = templates.data ?? []

  if (templates.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading templates…</p>
  }

  if (list.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-4">
          <Bot className="h-12 w-12 mx-auto text-muted-foreground" />
          <div>
            <p className="font-medium">No templates yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create a campaign first, then save it as a template from the discover page.
            </p>
          </div>
          <Link href="/discover">
            <Button>Start a campaign</Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="grid gap-4">
        {list.map((tpl) => (
          <TemplateCard
            key={tpl.id}
            template={tpl}
            expanded={expandedId === tpl.id}
            onToggleExpand={() => setExpandedId(expandedId === tpl.id ? null : tpl.id)}
            onRequestConsent={() => setConsentFor(tpl.id)}
            onRefetch={() => templates.refetch()}
          />
        ))}
      </div>

      <ConsentDialog
        templateId={consentFor}
        onClose={() => setConsentFor(null)}
        onAccepted={() => {
          setConsentFor(null)
          templates.refetch()
        }}
      />
    </>
  )
}

type RouterOutputs = inferRouterOutputs<AppRouter>
type Template = RouterOutputs['templates']['list'][number]
type AutopilotRun = RouterOutputs['templates']['listRuns'][number]

function TemplateCard({
  template,
  expanded,
  onToggleExpand,
  onRequestConsent,
  onRefetch,
}: {
  template: Template
  expanded: boolean
  onToggleExpand: () => void
  onRequestConsent: () => void
  onRefetch: () => void
}) {
  const setAutopilot = trpc.templates.setAutopilot.useMutation({
    onSuccess: () => {
      onRefetch()
      toast.success('Autopilot updated')
    },
    onError: (e) => toast.error(e.message),
  })

  const runNow = trpc.templates.runNow.useMutation({
    onSuccess: (res) => {
      toast.success(
        res.mode === 'inline'
          ? 'Autopilot running in-process (dev mode) — refresh runs shortly'
          : 'Autopilot run queued — check back in a few minutes',
      )
      onRefetch()
    },
    onError: (e) => toast.error(e.message),
  })

  const runs = trpc.templates.listRuns.useQuery(
    { id: template.id, limit: 5 },
    { enabled: expanded },
  )

  const missingRequired = !template.jobTitle || !template.region

  const handleToggle = (enabled: boolean) => {
    if (enabled && missingRequired) {
      toast.error('Add a job title and region to this template first.')
      if (!expanded) onToggleExpand()
      return
    }
    if (enabled && !template.autopilotAcceptedAt) {
      onRequestConsent()
      return
    }
    setAutopilot.mutate({ id: template.id, enabled })
  }

  const nextRun = template.autopilotNextRunAt
    ? new Date(template.autopilotNextRunAt).toLocaleString()
    : '—'
  const lastRun = template.autopilotLastRunAt
    ? new Date(template.autopilotLastRunAt).toLocaleString()
    : 'Never'

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-lg flex items-center gap-2">
              {template.name}
              {template.autopilotEnabled && (
                <Badge variant="default" className="text-[10px]">
                  <Zap className="h-3 w-3 mr-1" /> Autopilot on
                </Badge>
              )}
            </CardTitle>
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
              {template.jobTitle && (
                <span className="flex items-center gap-1">
                  <Briefcase className="h-3 w-3" />
                  {template.jobTitle}
                </span>
              )}
              {template.region && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {template.region}
                </span>
              )}
              {template.autopilotEnabled && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Next run: {nextRun}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Switch
              checked={template.autopilotEnabled}
              onCheckedChange={handleToggle}
              disabled={setAutopilot.isPending}
              aria-label="Toggle autopilot"
            />
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-4 border-t">
          <TemplateDetailsEditor template={template} onRefetch={onRefetch} />

          <AutopilotControls template={template} onRefetch={onRefetch} />

          <div className="pt-3 border-t">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium flex items-center gap-1.5">
                <History className="h-3.5 w-3.5" /> Recent runs
              </h4>
              <span className="text-xs text-muted-foreground">Last run: {lastRun}</span>
            </div>
            <RunsList
              runs={runs.data}
              loading={runs.isLoading}
              campaignId={template.autopilotCampaignId}
              requireApproval={template.autopilotRequireApproval}
            />
          </div>

          <div className="flex gap-2 pt-3 border-t">
            <Button
              size="sm"
              variant="outline"
              onClick={() => runNow.mutate({ id: template.id })}
              disabled={!template.autopilotEnabled || runNow.isPending}
            >
              <Play className="h-3 w-3 mr-1.5" />
              {runNow.isPending ? 'Queueing…' : 'Run now'}
            </Button>
            <Link href={`/discover?templateId=${template.id}`} className="ml-auto">
              <Button size="sm" variant="ghost">
                Edit or start manually
                <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </div>
        </CardContent>
      )}

      <div className="border-t px-6 py-2">
        <button
          type="button"
          onClick={onToggleExpand}
          className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground"
        >
          <span>{expanded ? 'Hide autopilot settings' : 'Configure autopilot'}</span>
          <ChevronRight
            className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
        </button>
      </div>
    </Card>
  )
}

function TemplateDetailsEditor({
  template,
  onRefetch,
}: {
  template: Template
  onRefetch: () => void
}) {
  const [jobTitle, setJobTitle] = useState(template.jobTitle ?? '')
  const [region, setRegion] = useState(template.region ?? '')
  const [industry, setIndustry] = useState(template.industry ?? '')

  const dirty =
    jobTitle.trim() !== (template.jobTitle ?? '') ||
    region.trim() !== (template.region ?? '') ||
    industry.trim() !== (template.industry ?? '')

  const missing = !template.jobTitle || !template.region

  const update = trpc.templates.update.useMutation({
    onSuccess: () => {
      onRefetch()
      toast.success('Template updated')
    },
    onError: (e) => toast.error(e.message),
  })

  const save = () => {
    update.mutate({
      id: template.id,
      jobTitle: jobTitle.trim() || null,
      region: region.trim() || null,
      industry: industry.trim() || null,
    })
  }

  return (
    <div className="pt-3 space-y-3">
      {missing && (
        <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p>
            <b>Job title and region are required for autopilot.</b> Fill them
            in below, then save — you&apos;ll be able to enable autopilot after.
          </p>
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">
            Job title <span className="text-destructive">*</span>
          </Label>
          <Input
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="e.g. Senior Software Engineer"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">
            Region <span className="text-destructive">*</span>
          </Label>
          <Input
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="e.g. Berlin, Germany"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Industry</Label>
          <Input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="Optional — e.g. Fintech"
          />
        </div>
      </div>
      {dirty && (
        <Button size="sm" onClick={save} disabled={update.isPending}>
          <Save className="h-3 w-3 mr-1.5" />
          {update.isPending ? 'Saving…' : 'Save template details'}
        </Button>
      )}
    </div>
  )
}

function AutopilotControls({
  template,
  onRefetch,
}: {
  template: Template
  onRefetch: () => void
}) {
  const setAutopilot = trpc.templates.setAutopilot.useMutation({
    onSuccess: () => {
      onRefetch()
      toast.success('Saved')
    },
    onError: (e) => toast.error(e.message),
  })

  const disabled = !template.autopilotEnabled || setAutopilot.isPending

  return (
    <div className="grid grid-cols-2 gap-3 pt-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Frequency</Label>
        <select
          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm disabled:opacity-50"
          value={template.autopilotFrequency}
          disabled={disabled}
          onChange={(e) =>
            setAutopilot.mutate({
              id: template.id,
              enabled: template.autopilotEnabled,
              frequency: e.target.value as Frequency,
            })
          }
        >
          <option value="daily">{FREQUENCY_LABEL.daily}</option>
          <option value="every2days">{FREQUENCY_LABEL.every2days}</option>
          <option value="weekly">{FREQUENCY_LABEL.weekly}</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Max companies per run</Label>
        <select
          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm disabled:opacity-50"
          value={template.autopilotDailyCap}
          disabled={disabled}
          onChange={(e) =>
            setAutopilot.mutate({
              id: template.id,
              enabled: template.autopilotEnabled,
              dailyCap: Number(e.target.value),
            })
          }
        >
          {[3, 5, 10, 15, 20].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Email tone</Label>
        <select
          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm disabled:opacity-50"
          value={template.autopilotTone}
          disabled={disabled}
          onChange={(e) =>
            setAutopilot.mutate({
              id: template.id,
              enabled: template.autopilotEnabled,
              tone: e.target.value as Tone,
            })
          }
        >
          <option value="concise">Concise</option>
          <option value="balanced">Balanced</option>
          <option value="detailed">Detailed</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Send mode</Label>
        <select
          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm disabled:opacity-50"
          value={template.autopilotRequireApproval ? 'approve' : 'auto'}
          disabled={disabled}
          onChange={(e) =>
            setAutopilot.mutate({
              id: template.id,
              enabled: template.autopilotEnabled,
              requireApproval: e.target.value === 'approve',
            })
          }
        >
          <option value="approve">Draft — I review before sending</option>
          <option value="auto">Auto-send via Gmail</option>
        </select>
      </div>
    </div>
  )
}

function RunsList({
  runs,
  loading,
  campaignId,
  requireApproval,
}: {
  runs: AutopilotRun[] | undefined
  loading: boolean
  campaignId: string | null
  requireApproval: boolean
}) {
  const [selected, setSelected] = useState<AutopilotRun | null>(null)

  if (loading) return <p className="text-xs text-muted-foreground">Loading…</p>
  if (!runs || runs.length === 0) {
    return <p className="text-xs text-muted-foreground">No runs yet.</p>
  }
  return (
    <>
      <div className="space-y-1.5">
        {runs.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setSelected(r)}
            className="w-full flex items-center justify-between text-xs border rounded px-3 py-2 text-left hover:bg-muted/50 hover:border-primary/40 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <StatusDot status={r.status} />
              <span className="text-muted-foreground">
                {new Date(r.startedAt).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-3 text-muted-foreground">
              {r.status === 'SUCCESS' && (
                <>
                  <span>{r.discovered} found</span>
                  <span>{r.generated} drafted</span>
                  {r.sent > 0 && <span>{r.sent} sent</span>}
                  {r.failed > 0 && <span className="text-destructive">{r.failed} failed</span>}
                </>
              )}
              {r.status === 'SKIPPED' && r.skipReason && (
                <span className="italic">Skipped: {r.skipReason.replaceAll('_', ' ')}</span>
              )}
              {r.status === 'FAILED' && r.error && (
                <span className="text-destructive truncate max-w-[240px]">{r.error}</span>
              )}
              <ChevronRight className="h-3 w-3 opacity-60" />
            </div>
          </button>
        ))}
      </div>

      <RunDetailDialog
        run={selected}
        campaignId={campaignId}
        requireApproval={requireApproval}
        onClose={() => setSelected(null)}
      />
    </>
  )
}

const SKIP_REASON_COPY: Record<string, string> = {
  not_pro: 'This template is on the free tier — upgrade to Pro to keep autopilot running.',
  no_cv: 'We couldn\'t find a CV on your profile. Upload one so autopilot has something to send.',
  no_gmail: 'Gmail isn\'t connected. Link your Gmail account to let autopilot send emails.',
  quota: 'You hit your monthly email quota. Drafts were not generated for this run.',
  no_companies_found: 'AI discovery returned no new companies matching your criteria.',
  no_new_companies: 'Everyone matching was already contacted — nothing new to reach out to.',
  cap_reached: 'Daily cap was reached before this run started.',
}

function RunDetailDialog({
  run,
  campaignId,
  requireApproval,
  onClose,
}: {
  run: AutopilotRun | null
  campaignId: string | null
  requireApproval: boolean
  onClose: () => void
}) {
  if (!run) {
    return (
      <Dialog open={false} onOpenChange={(open) => { if (!open) onClose() }}>
        <DialogContent />
      </Dialog>
    )
  }

  const duration = run.finishedAt
    ? Math.max(
        1,
        Math.round(
          (new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000,
        ),
      )
    : null

  const skipCopy = run.skipReason
    ? SKIP_REASON_COPY[run.skipReason] ?? `Skipped: ${run.skipReason.replaceAll('_', ' ')}`
    : null

  const hasResults = run.status === 'SUCCESS' && (run.discovered > 0 || run.generated > 0)

  return (
    <Dialog open={!!run} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StatusDot status={run.status} />
            Autopilot run · {run.status.toLowerCase()}
          </DialogTitle>
          <DialogDescription>
            Started {new Date(run.startedAt).toLocaleString()}
            {duration ? ` · took ${duration}s` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1 text-sm">
          {run.status === 'SUCCESS' && (
            <div className="grid grid-cols-4 gap-2 text-center">
              <Metric label="Found" value={run.discovered} />
              <Metric label="Drafted" value={run.generated} />
              <Metric label="Sent" value={run.sent} />
              <Metric
                label="Failed"
                value={run.failed}
                tone={run.failed > 0 ? 'destructive' : undefined}
              />
            </div>
          )}

          {run.status === 'SKIPPED' && skipCopy && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              {skipCopy}
            </div>
          )}

          {run.status === 'FAILED' && run.error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs font-mono whitespace-pre-wrap break-words max-h-48 overflow-auto">
              {run.error}
            </div>
          )}

          {run.status === 'RUNNING' && (
            <div className="rounded-md border border-blue-500/40 bg-blue-500/5 p-3 text-sm">
              This run is still in progress. Refresh in a moment to see the outcome.
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {hasResults && campaignId && (
            <Link
              href={
                requireApproval
                  ? `/review?campaignId=${campaignId}`
                  : `/campaigns/${campaignId}/inbox`
              }
            >
              <Button>
                {requireApproval ? 'Review drafts' : 'View sent emails'}
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'destructive'
}) {
  return (
    <div className="rounded-md border p-2">
      <div
        className={`text-xl font-semibold ${tone === 'destructive' ? 'text-destructive' : ''}`}
      >
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'SUCCESS'
      ? 'bg-green-500'
      : status === 'FAILED'
      ? 'bg-destructive'
      : status === 'SKIPPED'
      ? 'bg-amber-500'
      : 'bg-blue-500'
  return <span className={`h-2 w-2 rounded-full ${color}`} />
}

function ConsentDialog({
  templateId,
  onClose,
  onAccepted,
}: {
  templateId: string | null
  onClose: () => void
  onAccepted: () => void
}) {
  const setAutopilot = trpc.templates.setAutopilot.useMutation({
    onSuccess: () => {
      toast.success('Autopilot enabled')
      onAccepted()
    },
    onError: (e) => toast.error(e.message),
  })

  const accept = () => {
    if (!templateId) return
    setAutopilot.mutate({ id: templateId, enabled: true, consentAccepted: true })
  }

  return (
    <Dialog open={!!templateId} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enable autopilot?</DialogTitle>
          <DialogDescription>
            Once enabled, AutoApply will periodically discover matching jobs and
            prepare outreach emails on your behalf.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2.5 text-sm py-2">
          <div className="flex gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
            <span>You can stop autopilot at any time with the toggle.</span>
          </div>
          <div className="flex gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
            <span>
              By default, emails land as <b>drafts</b> in your dashboard for review
              before anything is sent.
            </span>
          </div>
          <div className="flex gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
            <span>
              Auto-send mode uses your Gmail OAuth and respects your monthly
              quota + daily limits.
            </span>
          </div>
          <div className="flex gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
            <span>Companies you&apos;ve already contacted or blacklisted are skipped.</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={accept} disabled={setAutopilot.isPending}>
            {setAutopilot.isPending ? 'Enabling…' : 'I authorize autopilot'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
