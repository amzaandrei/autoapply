'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Building2, Mail, Eye, MessageSquare, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { StaggerItem } from '@/components/Motion'

interface ContactedCompany {
  status: string
  sentAt: string | null
  openedAt: string | null
  repliedAt: string | null
  openCount: number
  company: { name: string; contactEmail: string | null; industry: string | null }
  campaign: { name: string }
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Mail; color: string }> = {
  SENT: { label: 'Sent', icon: Mail, color: 'text-muted-foreground' },
  OPENED: { label: 'Opened', icon: Eye, color: 'text-blue-500' },
  REPLIED: { label: 'Replied', icon: MessageSquare, color: 'text-green-500' },
  BOUNCED: { label: 'Bounced', icon: XCircle, color: 'text-destructive' },
}

export function ContactedCompanies({ companies }: { companies: ContactedCompany[] }) {
  const [expanded, setExpanded] = useState(false)

  if (companies.length === 0) return null

  // Dedup by contact email — show latest status per email
  const deduped = new Map<string, ContactedCompany>()
  for (const c of companies) {
    const key = c.company.contactEmail?.toLowerCase() ?? c.company.name.toLowerCase()
    if (!deduped.has(key)) deduped.set(key, c)
  }
  const uniqueCompanies = [...deduped.values()]
  const displayList = expanded ? uniqueCompanies : uniqueCompanies.slice(0, 5)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Contacted Companies ({uniqueCompanies.length})
          </CardTitle>
          {uniqueCompanies.length > 5 && (
            <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
              {expanded ? <><ChevronUp className="h-3.5 w-3.5 mr-1" /> Show less</> : <><ChevronDown className="h-3.5 w-3.5 mr-1" /> Show all</>}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1 overflow-x-auto">
          {/* Header */}
          <div className="min-w-[700px] grid grid-cols-[1fr_150px_100px_80px_100px] gap-2 px-3 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide border-b">
            <span>Company</span>
            <span>Email</span>
            <span>Campaign</span>
            <span>Status</span>
            <span>Date</span>
          </div>
          {/* Rows */}
          {displayList.map((c, i) => {
            const config = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.SENT
            const Icon = config.icon
            return (
              <StaggerItem key={`${c.company.contactEmail}-${i}`} index={i}>
                <div className="min-w-[700px] grid grid-cols-[1fr_150px_100px_80px_100px] gap-2 px-3 py-2 rounded-md hover:bg-muted/50 text-sm items-center border-b border-border/40 last:border-0">
                  <div>
                    <span className="font-medium">{c.company.name}</span>
                    {c.company.industry && (
                      <span className="text-xs text-muted-foreground ml-2">{c.company.industry}</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground truncate">{c.company.contactEmail ?? '—'}</span>
                  <span className="text-xs text-muted-foreground truncate">{c.campaign.name}</span>
                  <div className="flex items-center gap-1">
                    <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                    <span className="text-xs">{config.label}</span>
                    {c.openCount > 0 && c.status !== 'OPENED' && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                        <Eye className="h-2.5 w-2.5 mr-0.5" />{c.openCount}
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {c.sentAt ? new Date(c.sentAt).toLocaleDateString() : '—'}
                  </span>
                </div>
              </StaggerItem>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
