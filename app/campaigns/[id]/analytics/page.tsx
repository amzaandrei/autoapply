'use client'

import { use } from 'react'
import { CampaignAnalytics } from '@/components/CampaignAnalytics'
import { DashboardSubpageHeader } from '@/components/DashboardSubpageHeader'

export default function AnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <DashboardSubpageHeader
          title="Campaign Analytics"
          description="Open rates, reply rates, and A/B test results."
        />
        <CampaignAnalytics campaignId={id} />
      </div>
    </div>
  )
}
