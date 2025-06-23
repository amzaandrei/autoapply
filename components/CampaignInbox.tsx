'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Loader2, Send, Mail, Building2, MessageSquare, ArrowLeft } from 'lucide-react'
import { motion } from 'motion/react'
import { Skeleton } from '@/components/ui/skeleton'
import { sanitizeHtml } from '@/lib/sanitize-html'

interface ThreadMessage {
  id: string
  from: string
  to: string
  subject: string
  date: string
  bodyHtml: string | null
  bodyText: string | null
  messageId: string | null
  isFromUser: boolean
}

interface Conversation {
  id: string
  companyName: string
  contactEmail: string | null
  subject: string
  gmailThreadId: string | null
  sentAt: string | null
  repliedAt: string | null
}

function formatFrom(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*</)
  return match ? match[1].trim() : from.split('@')[0]
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return dateStr
  }
}

export function CampaignInbox({ campaignId, initialThreadId }: { campaignId: string; initialThreadId?: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(initialThreadId ?? null)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [replyBody, setReplyBody] = useState('')
  const [sending, setSending] = useState(false)
  const threadEndRef = useRef<HTMLDivElement>(null)

  // Auto-check for replies then load conversations
  useEffect(() => {
    async function loadInbox() {
      // Check for new replies first (silent — no toast on zero results)
      try {
        await fetch('/api/gmail/check-replies', { method: 'POST' })
      } catch {
        // Non-blocking — continue loading even if check fails
      }

      // Then load conversations
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/analytics`)
        const data = await res.json()
        setConversations(data.repliedEmails ?? [])
        if (!selectedThreadId && data.repliedEmails?.length > 0) {
          setSelectedThreadId(data.repliedEmails[0].gmailThreadId)
        }
      } catch {
        toast.error('Failed to load conversations')
      } finally {
        setLoading(false)
      }
    }
    void loadInbox()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId])

  // Load thread when selected
  useEffect(() => {
    if (!selectedThreadId) { setMessages([]); return }
    setThreadLoading(true)
    fetch(`/api/gmail/thread/${selectedThreadId}`)
      .then((r) => r.json())
      .then((data) => setMessages(data.messages ?? []))
      .catch(() => toast.error('Failed to load conversation'))
      .finally(() => setThreadLoading(false))
  }, [selectedThreadId])

  // Scroll to bottom when messages change
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const selectedConvo = conversations.find((c) => c.gmailThreadId === selectedThreadId)
  const lastMessage = messages[messages.length - 1]

  const handleSendReply = async () => {
    if (!replyBody.trim() || !selectedThreadId || !selectedConvo?.contactEmail) return
    setSending(true)
    try {
      const res = await fetch('/api/gmail/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: selectedThreadId,
          inReplyTo: lastMessage?.messageId ?? '',
          to: selectedConvo.contactEmail,
          subject: selectedConvo.subject,
          body: replyBody,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send')
      toast.success('Reply sent')
      setReplyBody('')
      // Reload thread to show new message
      const threadRes = await fetch(`/api/gmail/thread/${selectedThreadId}`)
      const threadData = await threadRes.json()
      setMessages(threadData.messages ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reply')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4 h-[calc(100vh-200px)]">
        <div className="border rounded-lg p-3 space-y-3">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 py-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
        <div className="border rounded-lg p-4 space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-64" />
          <div className="pt-8 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                <Skeleton className="h-20 w-3/5 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (conversations.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No conversations yet.</p>
          <p className="text-sm mt-1">Replies from companies will appear here.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4 h-[calc(100vh-200px)]">
      {/* Left: conversation list */}
      <div className="border rounded-lg overflow-y-auto">
        <div className="p-3 border-b">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Conversations ({conversations.length})
          </h3>
        </div>
        <div className="divide-y">
          {conversations.map((convo) => (
            <button
              key={convo.id}
              type="button"
              onClick={() => setSelectedThreadId(convo.gmailThreadId)}
              className={`w-full text-left p-3 hover:bg-accent/50 transition-colors ${
                selectedThreadId === convo.gmailThreadId ? 'bg-accent' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="font-medium text-sm truncate">{convo.companyName}</span>
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{convo.subject}</p>
              {convo.repliedAt && (
                <p className="text-[10px] text-green-600 mt-0.5">
                  Replied {formatDate(convo.repliedAt)}
                </p>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Right: thread view + reply */}
      <div className="border rounded-lg flex flex-col overflow-hidden">
        {selectedThreadId ? (
          <>
            {/* Thread header */}
            <div className="p-4 border-b shrink-0">
              <h3 className="font-semibold">{selectedConvo?.companyName}</h3>
              <p className="text-xs text-muted-foreground">{selectedConvo?.contactEmail} — {selectedConvo?.subject}</p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {threadLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-10">No messages in this thread.</p>
              ) : (
                messages.map((msg, i) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.05 }}
                    className={`flex ${msg.isFromUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 space-y-1 ${
                        msg.isFromUser
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      <div className={`flex items-center justify-between gap-3 text-[11px] ${
                        msg.isFromUser ? 'text-primary-foreground/70' : 'text-muted-foreground'
                      }`}>
                        <span className="font-medium">{formatFrom(msg.from)}</span>
                        <span>{formatDate(msg.date)}</span>
                      </div>
                      <div
                        className={`text-sm leading-relaxed ${msg.isFromUser ? '' : ''}`}
                        dangerouslySetInnerHTML={{
                          __html: sanitizeHtml(
                            msg.bodyHtml ??
                              (msg.bodyText
                                ? msg.bodyText
                                    .replace(/&/g, '&amp;')
                                    .replace(/</g, '&lt;')
                                    .replace(/>/g, '&gt;')
                                    .replace(/\n/g, '<br>')
                                : ''),
                          ),
                        }}
                      />
                    </div>
                  </motion.div>
                ))
              )}
              <div ref={threadEndRef} />
            </div>

            {/* Reply composer */}
            <div className="p-3 border-t shrink-0 space-y-2">
              <Textarea
                placeholder="Write your reply..."
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                rows={3}
                className="resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    void handleSendReply()
                  }
                }}
              />
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground">Ctrl+Enter to send</p>
                <Button
                  size="sm"
                  onClick={() => void handleSendReply()}
                  disabled={sending || !replyBody.trim()}
                >
                  {sending ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Sending...</>
                  ) : (
                    <><Send className="h-3.5 w-3.5 mr-1" /> Reply</>
                  )}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Select a conversation</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
