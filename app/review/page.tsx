'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import {
  CheckCircle,
  Edit3,
  Trash2,
  ArrowRight,
  Check,
  X,
  Mail,
  Loader2,
  RefreshCw,
  Zap,
  Minus,
  FileText,
  Eye,
} from 'lucide-react'
import { StepIndicator } from '@/components/StepIndicator'
import { PageTransition, StaggerItem } from '@/components/Motion'

type EmailTone = 'concise' | 'balanced' | 'detailed'

const TONE_OPTIONS: { value: EmailTone; label: string; desc: string; icon: typeof Zap }[] = [
  { value: 'concise',  label: 'Short & Direct',   desc: '~80 words, straight to the point', icon: Zap },
  { value: 'balanced', label: 'Balanced',          desc: '~150-200 words, professional',     icon: Minus },
  { value: 'detailed', label: 'In-Depth',          desc: '~250-300 words, thorough',         icon: FileText },
]

function ReviewPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const campaignId = searchParams.get('campaignId') ?? ''

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)

  function toHtml(text: string): string {
    // HTML-escape before wrapping — prevents XSS in email preview.
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
    return escaped
      .split(/\n\n+/)
      .map(para => `<p style="margin:0 0 14px 0;line-height:1.6;font-family:Arial,sans-serif;font-size:14px;color:#333;">${para.replace(/\n/g, '<br>')}</p>`)
      .join('')
  }

  const emails = trpc.emails.list.useQuery({ campaignId }, { enabled: !!campaignId })
  const campaign = trpc.campaigns.getById.useQuery({ id: campaignId }, { enabled: !!campaignId })

  const updateEmail = trpc.emails.update.useMutation({
    onSuccess: () => {
      emails.refetch()
      setEditingId(null)
      toast.success('Saved')
    },
    onError: (e) => toast.error(e.message),
  })

  const deleteEmail = trpc.emails.delete.useMutation({
    onSuccess: () => emails.refetch(),
    onError: (e) => toast.error(e.message),
  })
  const [pendingDelete, setPendingDelete] = useState<Set<string>>(new Set())

  const handleDeleteEmail = (id: string, companyName: string) => {
    // Optimistic hide
    setPendingDelete((prev) => new Set(prev).add(id))

    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      deleteEmail.mutate({ id })
    }, 5000)

    toast(`Email for ${companyName} deleted`, {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: () => {
          cancelled = true
          clearTimeout(timer)
          setPendingDelete((prev) => { const n = new Set(prev); n.delete(id); return n })
          toast.success('Restored')
        },
      },
    })
  }

  const approveEmail = (id: string) => {
    updateEmail.mutate({ id, status: 'READY' })
  }

  const approveAll = () => {
    const drafts = emails.data?.filter((e) => e.status === 'DRAFT') ?? []
    if (drafts.length === 0) {
      toast.info('All emails already approved')
      return
    }

    // For A/B groups, pick one random variant per group
    const abGroups = new Map<string, typeof drafts>()
    const nonAbDrafts: typeof drafts = []
    for (const d of drafts) {
      if (d.abGroup) {
        const group = abGroups.get(d.abGroup) ?? []
        group.push(d)
        abGroups.set(d.abGroup, group)
      } else {
        nonAbDrafts.push(d)
      }
    }

    const toApprove = [...nonAbDrafts]
    for (const group of abGroups.values()) {
      // Pick random variant from each group
      const pick = group[Math.floor(Math.random() * group.length)]
      toApprove.push(pick)
    }

    Promise.all(
      toApprove.map((e) =>
        updateEmail.mutateAsync({ id: e.id, status: 'READY' })
      )
    ).then(() => {
      toast.success(`${toApprove.length} emails approved — ready to send.`)
    }).catch(() => toast.error('Some approvals failed'))
  }

  const startEdit = (email: { id: string; subject: string; body: string }) => {
    setEditingId(email.id)
    setEditSubject(email.subject)
    setEditBody(email.body)
  }

  const saveEdit = () => {
    if (!editingId) return
    updateEmail.mutate({ id: editingId, subject: editSubject, body: editBody })
  }

  const regenerateEmail = async (emailId: string, companyId: string, tone: EmailTone) => {
    setRegeneratingId(emailId)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, companyId, tone }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Regeneration failed')
      await emails.refetch()
      toast.success('Email regenerated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Regeneration failed')
    } finally {
      setRegeneratingId(null)
    }
  }

  const hasAbTest = campaign.data?.abTestEnabled ?? false
  // For display counts, exclude the "other" A/B variant (unpicked drafts in a group where one is already READY)
  const pickedAbGroups = new Set(
    emails.data?.filter((e) => e.status === 'READY' && e.abGroup).map((e) => e.abGroup) ?? []
  )
  const visibleEmails = emails.data?.filter((e) => {
    // Hide emails pending deletion (undo window)
    if (pendingDelete.has(e.id)) return false
    // Hide the unpicked variant if the other in the group is already READY
    if (e.abGroup && e.status === 'DRAFT' && pickedAbGroups.has(e.abGroup)) return false
    return true
  }) ?? []
  const totalEmails = visibleEmails.length
  const readyCount = visibleEmails.filter((e) => e.status === 'READY').length
  const draftCount = visibleEmails.filter((e) => e.status === 'DRAFT').length

  return (
    <div className="min-h-screen bg-background">
      <PageTransition>
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" onClick={() => router.push(`/discover?campaignId=${campaignId}`)}>← Back to Discover</Button>
        <StepIndicator currentStep={4} campaignId={campaignId} />

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Review Emails</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {readyCount} of {totalEmails} approved
              {totalEmails > 0 && readyCount < totalEmails && ' — approve emails to send them'}
            </p>
            {hasAbTest && draftCount > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                A/B testing is on — Approve All will randomly pick one variant per company. Only the picked version gets sent.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={approveAll} disabled={updateEmail.isPending}>
              <Check className="h-4 w-4 mr-1" /> Approve All
            </Button>
            <Button
              onClick={() => router.push(`/send?campaignId=${campaignId}`)}
              disabled={readyCount === 0}
            >
              Send {readyCount > 0 ? readyCount : ''} Emails
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>

        {/* Email cards */}
        <div className="space-y-4">
          {visibleEmails.map((email, idx) => (
            <StaggerItem key={email.id} index={idx}>
            <Card
              key={email.id}
              className={`transition-colors ${
                email.status === 'READY'
                  ? 'border-green-500/50 bg-green-50/30 dark:bg-green-950/10'
                  : email.status === 'SENT'
                    ? 'border-blue-500/50 bg-blue-50/30 dark:bg-blue-950/10 opacity-60'
                    : ''
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                      <CardTitle className="text-base truncate">
                        {email.company.name}
                      </CardTitle>
                      <Badge
                        variant={
                          email.status === 'READY'
                            ? 'default'
                            : email.status === 'SENT'
                              ? 'secondary'
                              : 'outline'
                        }
                        className="text-xs shrink-0"
                      >
                        {email.status.toLowerCase()}
                      </Badge>
                      {email.variant && (
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          Variant {email.variant}
                        </Badge>
                      )}
                    </div>
                    {email.company.contactEmail && (
                      <p className="text-xs text-muted-foreground ml-6 mt-0.5">
                        To: {email.company.contactEmail}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {email.status !== 'SENT' && (
                      <>
                        {email.status !== 'READY' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 border-green-500/50 hover:bg-green-50"
                            onClick={() => approveEmail(email.id)}
                            disabled={updateEmail.isPending}
                          >
                            <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              title="Regenerate"
                              disabled={regeneratingId === email.id}
                            >
                              {regeneratingId === email.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel>Regenerate with tone</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {TONE_OPTIONS.map((opt) => {
                              const Icon = opt.icon
                              return (
                                <DropdownMenuItem
                                  key={opt.value}
                                  onClick={() => void regenerateEmail(email.id, email.company.id, opt.value)}
                                >
                                  <Icon className="h-4 w-4 mr-2 shrink-0" />
                                  <div>
                                    <p className="font-medium text-sm">{opt.label}</p>
                                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                                  </div>
                                </DropdownMenuItem>
                              )
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          size="icon"
                          variant="ghost"
                          className={`h-8 w-8 ${previewId === email.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                          title="Preview as HTML"
                          onClick={() => setPreviewId(previewId === email.id ? null : email.id)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => startEdit(email)}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteEmail(email.id, email.company.name)}
                          disabled={deleteEmail.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {email.status === 'READY' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                        onClick={() => updateEmail.mutate({ id: email.id, status: 'DRAFT' })}
                      >
                        <X className="h-3.5 w-3.5 mr-1" /> Unapprove
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {editingId === email.id ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Subject
                      </label>
                      <Input
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Body — edit on left, preview on right
                        </label>
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <Textarea
                          className="min-h-[320px] font-mono text-xs"
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                        />
                        <div className="min-h-[320px] rounded-md border bg-white p-4 overflow-y-auto">
                          <div dangerouslySetInnerHTML={{ __html: toHtml(editBody) }} />
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={saveEdit}
                        disabled={updateEmail.isPending}
                      >
                        {updateEmail.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          'Save'
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : previewId === email.id ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">HTML Preview</p>
                      <Badge variant="outline" className="text-[10px]">As recipient sees it</Badge>
                    </div>
                    <div className="rounded-md border bg-white p-4">
                      <p style={{ margin: '0 0 8px 0', fontFamily: 'Arial, sans-serif', fontSize: '14px', fontWeight: 600, color: '#333' }}>
                        {email.subject}
                      </p>
                      <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '8px 0 14px' }} />
                      <div dangerouslySetInnerHTML={{ __html: toHtml(email.body) }} />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      Subject: {email.subject}
                    </p>
                    <Separator />
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{email.body}</p>
                  </div>
                )}
                {/* Notes */}
                <div className="mt-3 pt-3 border-t">
                  <Textarea
                    placeholder="Add notes about this company..."
                    className="min-h-[60px] text-xs resize-none"
                    defaultValue={email.notes ?? ''}
                    onBlur={(e) => {
                      const val = e.target.value
                      if (val !== (email.notes ?? '')) {
                        updateEmail.mutate({ id: email.id, notes: val })
                      }
                    }}
                  />
                </div>
              </CardContent>
            </Card>
            </StaggerItem>
          ))}

          {visibleEmails.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Mail className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="font-medium">No emails generated yet. Go back to Generate to create your emails.</p>
            </div>
          )}
        </div>

      </div>
      </PageTransition>
    </div>
  )
}

export default function ReviewPageWrapper() {
  return (
    <Suspense>
      <ReviewPage />
    </Suspense>
  )
}
