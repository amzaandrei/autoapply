'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense, useState, useEffect } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
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
  Mail,
  Send,
  CheckCircle,
  XCircle,
  Loader2,
  ArrowRight,
  Plug,
  PlugZap,
  AlertCircle,
  SkipForward,
  Eye,
  MessageSquare,
  RefreshCw,
} from 'lucide-react'
import { StepIndicator } from '@/components/StepIndicator'
import { PageTransition } from '@/components/Motion'
import { friendlyError } from '@/lib/error-messages'
import { EmailVerificationBadge } from '@/components/EmailVerificationBadge'
import Link from 'next/link'

interface SendResult {
  emailId: string
  companyName: string
  to: string
  status: 'sent' | 'failed' | 'skipped'
  error?: string
  gmailMessageId?: string
}

function SendPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const campaignId = searchParams.get('campaignId') ?? ''

  const [sendDialogOpen, setSendDialogOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendResults, setSendResults] = useState<SendResult[] | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [checkingReplies, setCheckingReplies] = useState(false)
  const [processingFollowUps, setProcessingFollowUps] = useState(false)
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null)

  const gmailStatus = trpc.gmail.status.useQuery()
  const campaign = trpc.campaigns.getById.useQuery({ id: campaignId }, { enabled: !!campaignId })
  const profile = trpc.profile.get.useQuery()
  const emails = trpc.emails.list.useQuery(
    { campaignId, status: 'READY' },
    { enabled: !!campaignId }
  )
  const sentEmails = trpc.emails.list.useQuery(
    { campaignId, status: 'SENT' },
    { enabled: !!campaignId }
  )
  const openedEmails = trpc.emails.list.useQuery(
    { campaignId, status: 'OPENED' },
    { enabled: !!campaignId }
  )
  const repliedEmails = trpc.emails.list.useQuery(
    { campaignId, status: 'REPLIED' },
    { enabled: !!campaignId }
  )
  const bouncedEmails = trpc.emails.list.useQuery(
    { campaignId, status: 'BOUNCED' },
    { enabled: !!campaignId }
  )

  // Handle OAuth return params
  useEffect(() => {
    const gmailConnected = searchParams.get('gmailConnected')
    const gmailError = searchParams.get('gmailError')
    if (gmailConnected) {
      toast.success('Gmail connected. Ready to send.')
      gmailStatus.refetch()
    }
    if (gmailError) {
      toast.error(`Gmail connection failed: ${gmailError}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const handleSendAll = async () => {
    setSendDialogOpen(false)
    setSending(true)
    setSendResults(null)
    setSendError(null)

    const total = readyEmails.length
    setProgress({ sent: 0, total })

    // Poll progress every 1.5s while sending
    const pollTimer = setInterval(async () => {
      try {
        const res = await fetch(`/api/gmail/send-progress?campaignId=${campaignId}`)
        const data = await res.json() as { sent: number; opened: number; replied: number; bounced: number }
        // "sent" here means total outgoing this session — track the increase
        const done = (data.sent ?? 0) + (data.opened ?? 0) + (data.replied ?? 0) + (data.bounced ?? 0)
        setProgress({ sent: Math.min(done, total), total })
      } catch {
        // Ignore poll errors
      }
    }, 1500)

    try {
      const res = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      })
      const data = await res.json() as {
        sent?: number
        failed?: number
        skipped?: number
        results?: SendResult[]
        error?: string
      }

      if (!res.ok) {
        setSendError(data.error ?? 'Send failed')
        toast.error(data.error ?? 'Send failed')
        return
      }

      setSendResults(data.results ?? [])
      emails.refetch()
      sentEmails.refetch()

      if ((data.sent ?? 0) > 0) {
        toast.success(`Done. ${data.sent} applications sent.`)
      }
      if ((data.failed ?? 0) > 0) {
        toast.error(`${data.failed} emails failed to send.`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Send failed'
      const f = friendlyError(message)
      setSendError(f.title)
      toast.error(f.title, { description: f.description })
    } finally {
      clearInterval(pollTimer)
      setSending(false)
      setProgress(null)
    }
  }

  const [showReconnect, setShowReconnect] = useState(false)

  const handleCheckReplies = async () => {
    setCheckingReplies(true)
    try {
      const res = await fetch('/api/gmail/check-replies', { method: 'POST' })
      const data = await res.json() as { checked?: number; repliesFound?: number; error?: string; needsReconnect?: boolean }
      if (data.needsReconnect) {
        setShowReconnect(true)
        toast.error('Gmail needs updated permissions for reply tracking.')
        return
      }
      if (!res.ok) throw new Error(data.error ?? 'Check failed')
      sentEmails.refetch()
      openedEmails.refetch()
      repliedEmails.refetch()
      if ((data.repliesFound ?? 0) > 0) {
        toast.success(`Found ${data.repliesFound} new replies!`)
      } else {
        toast.info(`Checked ${data.checked} emails — no new replies yet.`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to check replies'
      const f = friendlyError(msg)
      toast.error(f.title, { description: f.description })
    } finally {
      setCheckingReplies(false)
    }
  }

  const handleProcessFollowUps = async () => {
    setProcessingFollowUps(true)
    try {
      const res = await fetch('/api/followups/process', { method: 'POST' })
      const data = await res.json() as { sent?: number; failed?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      if ((data.sent ?? 0) > 0) {
        toast.success(`${data.sent} follow-ups sent!`)
      } else {
        toast.info('No follow-ups needed right now.')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to process follow-ups'
      const f = friendlyError(msg)
      toast.error(f.title, { description: f.description })
    } finally {
      setProcessingFollowUps(false)
    }
  }

  const readyEmails = emails.data ?? []
  const sendableReady = readyEmails.filter((e) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return e.company.contactEmail && emailRegex.test(e.company.contactEmail)
  })
  const alreadySent = [...(sentEmails.data ?? []), ...(openedEmails.data ?? [])]
  const alreadyReplied = repliedEmails.data ?? []
  const isGmailConnected = gmailStatus.data?.connected ?? false
  const needsReauth = gmailStatus.data?.needsReauth ?? false
  const hasCvPdf = !!(profile.data?.cvPdfBase64)

  const gmailAuthUrl = `/api/gmail/auth${campaignId ? `?state=${campaignId}` : ''}`

  return (
    <div className="min-h-screen bg-background">
      <PageTransition>
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" onClick={() => router.push(`/discover?campaignId=${campaignId}`)}>← Back to Discover</Button>
        <StepIndicator currentStep={5} campaignId={campaignId} />

        <div className="space-y-6">
          {/* Gmail connection */}
          <Card className={isGmailConnected ? 'border-green-500/50' : ''}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  {isGmailConnected ? (
                    <><PlugZap className="h-5 w-5 text-green-500" /> Gmail Connected</>
                  ) : (
                    <><Plug className="h-5 w-5 text-muted-foreground" /> Connect Gmail</>
                  )}
                </CardTitle>
                {isGmailConnected ? (
                  <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
                    <CheckCircle className="h-3 w-3 mr-1" /> Ready
                  </Badge>
                ) : (
                  <Button asChild>
                    <a href={gmailAuthUrl}>Connect Gmail</a>
                  </Button>
                )}
              </div>
              <CardDescription>
                {isGmailConnected
                  ? 'AutoApply can send emails on your behalf via Gmail.'
                  : 'Connect your Gmail account to send applications directly.'}
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Ready to send */}
          {readyEmails.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    {sendableReady.length} Email{sendableReady.length !== 1 ? 's' : ''} Ready to Send
                    {readyEmails.length - sendableReady.length > 0 && (
                      <span className="text-xs font-normal text-amber-600 dark:text-amber-400 ml-1">
                        · {readyEmails.length - sendableReady.length} will be skipped
                      </span>
                    )}
                  </CardTitle>
                  <Button
                    onClick={() => setSendDialogOpen(true)}
                    disabled={!isGmailConnected || sending || sendableReady.length === 0}
                    size="lg"
                  >
                    {sending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</>
                    ) : (
                      <><Send className="h-4 w-4 mr-2" /> Send {sendableReady.length > 0 ? sendableReady.length : ''}{sendableReady.length !== readyEmails.length ? ' valid' : ''}</>
                    )}
                  </Button>
                </div>
                {!isGmailConnected && (
                  <p className="text-sm text-amber-600 flex items-center gap-1.5 mt-1">
                    <AlertCircle className="h-4 w-4" />
                    Connect Gmail above to send
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {readyEmails.map((email) => {
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
                    const needsEmail = !email.company.contactEmail || !emailRegex.test(email.company.contactEmail)
                    return (
                      <div
                        key={email.id}
                        className={`flex items-center justify-between p-3 rounded-md border text-sm ${needsEmail ? 'border-amber-500/50 bg-amber-50/30 dark:bg-amber-950/10' : ''}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{email.company.name}</p>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className={`text-xs ${needsEmail ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
                              To: {email.company.contactEmail ?? '(no email found)'}
                              {needsEmail && ' — will be skipped'}
                            </p>
                            {!needsEmail && (
                              <EmailVerificationBadge
                                status={email.company.contactEmailStatus}
                                score={email.company.contactEmailScore}
                              />
                            )}
                          </div>
                          {hasCvPdf && campaign.data?.attachCv && !needsEmail && (
                            <Badge variant="secondary" className="mt-1 text-xs">
                              📎 CV attached
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right text-xs text-muted-foreground max-w-[200px] truncate">
                            {email.subject}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Send progress */}
          {sending && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Sending applications...</p>
                    {progress && (
                      <p className="text-sm text-muted-foreground tabular-nums">
                        {progress.sent} / {progress.total}
                      </p>
                    )}
                  </div>
                  <Progress
                    value={progress && progress.total > 0 ? (progress.sent / progress.total) * 100 : undefined}
                    className={progress ? '' : 'animate-pulse'}
                  />
                  <p className="text-xs text-muted-foreground">
                    Emails go out with a 2-5s delay between each to avoid spam filters.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Completion report */}
          {sendResults && sendResults.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Delivery Report
                </CardTitle>
                <CardDescription>
                  {sendResults.filter((r) => r.status === 'sent').length} delivered ·{' '}
                  {sendResults.filter((r) => r.status === 'failed').length} failed ·{' '}
                  {sendResults.filter((r) => r.status === 'skipped').length} skipped
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {sendResults.map((result) => (
                    <div
                      key={result.emailId}
                      className="flex items-center gap-3 p-3 rounded-md border text-sm"
                    >
                      {result.status === 'sent' ? (
                        <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                      ) : result.status === 'failed' ? (
                        <XCircle className="h-4 w-4 text-destructive shrink-0" />
                      ) : (
                        <SkipForward className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{result.companyName}</p>
                        <p className="text-xs text-muted-foreground truncate">{result.to}</p>
                        {result.error && (
                          <p className="text-xs text-destructive">{result.error}</p>
                        )}
                      </div>
                      <Badge
                        variant={
                          result.status === 'sent'
                            ? 'default'
                            : result.status === 'failed'
                              ? 'destructive'
                              : 'secondary'
                        }
                        className="text-xs shrink-0"
                      >
                        {result.status}
                      </Badge>
                    </div>
                  ))}
                </div>
                <div className="mt-6">
                  <Button asChild size="lg" className="w-full sm:w-auto">
                    <Link href="/dashboard">← Back to Dashboard</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error state */}
          {sendError && (
            <Card className="border-destructive/50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-destructive">
                  <XCircle className="h-5 w-5 shrink-0" />
                  <p className="text-sm">{sendError}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Replied */}
          {alreadyReplied.length > 0 && (
            <Card className="border-green-500/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-green-500" />
                  Replies ({alreadyReplied.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {alreadyReplied.map((email) => (
                    <div key={email.id} className="flex items-center justify-between p-2 text-sm">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-3.5 w-3.5 text-green-500" />
                        <span className="font-medium">{email.company.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {email.repliedAt ? new Date(email.repliedAt).toLocaleDateString() : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Bounced — rare now that Hunter verifies every email pre-send */}
          {(bouncedEmails.data?.length ?? 0) > 0 && (
            <Card className="border-amber-500/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  Bounced ({bouncedEmails.data?.length})
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Gmail reported these as undeliverable despite Hunter verification. Re-run discovery
                  to find fresh candidates.
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {bouncedEmails.data?.map((email) => (
                    <div key={email.id} className="flex items-center justify-between p-3 rounded-md border border-amber-500/30 text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{email.company.name}</p>
                        <p className="text-xs text-amber-700 dark:text-amber-400 truncate">
                          {email.company.contactEmail ?? '(no email)'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Already sent */}
          {alreadySent.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Sent ({alreadySent.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {alreadySent.map((email) => (
                    <div
                      key={email.id}
                      className="flex items-center justify-between p-2 text-sm text-muted-foreground"
                    >
                      <div className="flex items-center gap-2">
                        <span>{email.company.name}</span>
                        {email.openCount > 0 && (
                          <Badge variant="outline" className="text-[10px] gap-0.5 px-1.5 py-0">
                            <Eye className="h-3 w-3" /> {email.openCount}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs">
                        {email.sentAt ? new Date(email.sentAt).toLocaleDateString() : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {readyEmails.length === 0 && alreadySent.length === 0 && alreadyReplied.length === 0 && !sending && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Mail className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium">Sent. Now we wait.</p>
                <p className="text-sm mt-1">
                  No emails ready to send. Go back to Review and approve your emails.
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => router.push(`/review?campaignId=${campaignId}`)}
                >
                  Back to Review
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Confirmation dialog */}
        <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send {sendableReady.length} application{sendableReady.length !== 1 ? 's' : ''}?</DialogTitle>
              <DialogDescription>
                We&apos;ll send a tailored email to {sendableReady.length} compan{sendableReady.length !== 1 ? 'ies' : 'y'}.
                {readyEmails.length - sendableReady.length > 0 && (
                  <> The other {readyEmails.length - sendableReady.length} without valid emails will be skipped.</>
                )}
                {' '}This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSendDialogOpen(false)}>
                Review Before Sending
              </Button>
              <Button onClick={() => void handleSendAll()}>
                <Send className="h-4 w-4 mr-2" /> Apply to All
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
      </PageTransition>
    </div>
  )
}

export default function SendPageWrapper() {
  return (
    <Suspense>
      <SendPage />
    </Suspense>
  )
}
