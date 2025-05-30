'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CampaignAnalytics } from '@/components/CampaignAnalytics'
import { ArrowLeft } from 'lucide-react'

export default function AnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 -ml-2"
          onClick={() => router.push('/dashboard')}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Dashboard
        </Button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold">Campaign Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Open rates, reply rates, and A/B test results.
          </p>
        </div>

        <CampaignAnalytics campaignId={id} />
      </div>
    </div>
  )
}
