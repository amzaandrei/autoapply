'use client'

import { use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { CampaignInbox } from '@/components/CampaignInbox'
import { ArrowLeft } from 'lucide-react'

function InboxPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialThread = searchParams.get('thread') ?? undefined

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 -ml-2"
          onClick={() => router.push(`/campaigns/${id}/analytics`)}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Analytics
        </Button>

        <div className="mb-4">
          <h1 className="text-2xl font-bold">Inbox</h1>
          <p className="text-muted-foreground text-sm mt-1">
            View and reply to company responses.
          </p>
        </div>

        <CampaignInbox campaignId={id} initialThreadId={initialThread} />
      </div>
    </div>
  )
}

export default function InboxPageWrapper({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <InboxPage params={params} />
    </Suspense>
  )
}
