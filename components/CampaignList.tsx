'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { ArrowRight, Send, Trash2 } from 'lucide-react'

type Campaign = {
  id: string
  name: string
  status: string
  sentCount: number
  _count: {
    companies: number
    emails: number
  }
}

const statusColors: Record<string, string> = {
  DRAFT: 'secondary',
  ACTIVE: 'default',
  PAUSED: 'secondary',
  COMPLETED: 'secondary',
  ARCHIVED: 'outline',
}

export default function CampaignList({ campaigns: initialCampaigns }: { campaigns: Campaign[] }) {
  const [campaigns, setCampaigns] = useState(initialCampaigns)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setCampaigns((prev) => prev.filter((c) => c.id !== id))
      }
    } finally {
      setDeletingId(null)
    }
  }

  if (campaigns.length === 0) return null

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Recent Campaigns</h2>
      <div className="space-y-3">
        {campaigns.map((campaign) => (
          <Card key={campaign.id}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-medium">{campaign.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {campaign._count.companies} companies · {campaign._count.emails} emails
                      {campaign.sentCount > 0 && ` · ${campaign.sentCount} sent`}
                    </p>
                  </div>
                  <Badge
                    variant={
                      statusColors[campaign.status] as
                        | 'default'
                        | 'secondary'
                        | 'outline'
                        | 'destructive'
                    }
                  >
                    {campaign.status.toLowerCase()}
                  </Badge>
                </div>
                <div className="flex gap-2 items-center">
                  {campaign._count.emails === 0 ? (
                    <Link href={`/generate?campaignId=${campaign.id}`}>
                      <Button size="sm" variant="outline">
                        Generate <ArrowRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    </Link>
                  ) : (
                    <Link href={`/review?campaignId=${campaign.id}`}>
                      <Button size="sm" variant="outline">
                        Review <ArrowRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    </Link>
                  )}
                  <Link href={`/send?campaignId=${campaign.id}`}>
                    <Button size="sm">
                      Send <Send className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </Link>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
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
                          onClick={() => handleDelete(campaign.id)}
                          disabled={deletingId === campaign.id}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {deletingId === campaign.id ? 'Deleting…' : 'Delete'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
