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
} from 'lucide-react'
import { StepIndicator } from '@/components/StepIndicator'

function ReviewPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const campaignId = searchParams.get('campaignId') ?? ''

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)

  const emails = trpc.emails.list.useQuery({ campaignId }, { enabled: !!campaignId })

  const updateEmail = trpc.emails.update.useMutation({
    onSuccess: () => {
      emails.refetch()
      setEditingId(null)
      toast.success('Saved')
    },
    onError: (e) => toast.error(e.message),
  })

  const deleteEmail = trpc.emails.delete.useMutation({
    onSuccess: () => {
      emails.refetch()
      toast.success('Removed')
    },
    onError: (e) => toast.error(e.message),
  })

  const approveEmail = (id: string) => {
    updateEmail.mutate({ id, status: 'READY' })
  }

  const approveAll = () => {
    const drafts = emails.data?.filter((e) => e.status === 'DRAFT') ?? []
    if (drafts.length === 0) {
      toast.info('All emails already approved')
      return
    }
    Promise.all(
      drafts.map((e) =>
        updateEmail.mutateAsync({ id: e.id, status: 'READY' })
      )
    ).then(() => {
      toast.success(`${drafts.length} emails approved — ready to send.`)
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

  const regenerateEmail = async (emailId: string, companyId: string) => {
    setRegeneratingId(emailId)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, companyId }),
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

  const totalEmails = emails.data?.length ?? 0
  const readyCount = emails.data?.filter((e) => e.status === 'READY').length ?? 0

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" onClick={() => router.push(`/generate?campaignId=${campaignId}`)}>← Back to Generate</Button>
        <StepIndicator currentStep={4} campaignId={campaignId} />

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Review Emails</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {readyCount} of {totalEmails} approved
              {totalEmails > 0 && readyCount < totalEmails && ' — approve emails to send them'}
            </p>
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
          {emails.data?.map((email) => (
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
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title="Regenerate"
                          onClick={() => void regenerateEmail(email.id, email.company.id)}
                          disabled={regeneratingId === email.id}
                        >
                          {regeneratingId === email.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
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
                          onClick={() => deleteEmail.mutate({ id: email.id })}
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
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Body
                      </label>
                      <Textarea
                        className="min-h-[220px]"
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                      />
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
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      Subject: {email.subject}
                    </p>
                    <Separator />
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{email.body}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {emails.data?.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Mail className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="font-medium">No emails generated yet. Go back to Generate to create your emails.</p>
            </div>
          )}
        </div>

      </div>
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
