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
} from 'lucide-react'

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

  const gmailStatus = trpc.gmail.status.useQuery()
  const emails = trpc.emails.list.useQuery(
    { campaignId, status: 'READY' },
    { enabled: !!campaignId }
  )
  const sentEmails = trpc.emails.list.useQuery(
    { campaignId, status: 'SENT' },
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
  }, [searchParams, gmailStatus])

  const handleSendAll = async () => {
    setSendDialogOpen(false)
    setSending(true)
    setSendResults(null)
    setSendError(null)

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
      setSendError(message)
      toast.error(message)
    } finally {
      setSending(false)
    }
  }

  const readyEmails = emails.data ?? []
  const alreadySent = sentEmails.data ?? []
  const isGmailConnected = gmailStatus.data?.connected ?? false

  const gmailAuthUrl = `/api/gmail/auth${campaignId ? `?state=${campaignId}` : ''}`

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8 text-sm text-muted-foreground">
          <span className="line-through">1 Upload CV</span>
          <ArrowRight className="h-4 w-4" />
          <span className="line-through">2 Discover</span>
          <ArrowRight className="h-4 w-4" />
          <span className="line-through">3 Generate</span>
          <ArrowRight className="h-4 w-4" />
          <span className="line-through">4 Review</span>
          <ArrowRight className="h-4 w-4" />
          <span className="font-semibold text-primary">5 Send</span>
        </div>

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
                    {readyEmails.length} Email{readyEmails.length !== 1 ? 's' : ''} Ready to Send
                  </CardTitle>
                  <Button
                    onClick={() => setSendDialogOpen(true)}
                    disabled={!isGmailConnected || sending}
                    size="lg"
                  >
                    {sending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</>
                    ) : (
                      <><Send className="h-4 w-4 mr-2" /> Send All</>
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
                  {readyEmails.map((email) => (
                    <div
                      key={email.id}
                      className="flex items-center justify-between p-3 rounded-md border text-sm"
                    >
                      <div>
                        <p className="font-medium">{email.company.name}</p>
                        <p className="text-xs text-muted-foreground">
                          To: {email.company.contactEmail ?? '(no email — will be skipped)'}
                        </p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground max-w-[200px] truncate">
                        {email.subject}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Send progress */}
          {sending && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <p className="text-sm font-medium">Sending applications...</p>
                  <Progress value={sendResults ? 100 : undefined} className="animate-pulse" />
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

          {/* Already sent */}
          {alreadySent.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Already Sent ({alreadySent.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {alreadySent.map((email) => (
                    <div
                      key={email.id}
                      className="flex items-center justify-between p-2 text-sm text-muted-foreground"
                    >
                      <span>{email.company.name}</span>
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
          {readyEmails.length === 0 && alreadySent.length === 0 && !sending && (
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
              <DialogTitle>Apply to all {readyEmails.length} new matches?</DialogTitle>
              <DialogDescription>
                We&apos;ll submit your profile to each company with a tailored application. This
                action cannot be undone.
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
