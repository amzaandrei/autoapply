'use client'

import { use } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DashboardSubpageHeader } from '@/components/DashboardSubpageHeader'
import { toast } from 'sonner'
import { Building2, ChevronRight, X } from 'lucide-react'

const STAGES = [
  { key: 'APPLIED', label: 'Applied', bg: 'bg-slate-50 dark:bg-slate-900', border: 'border-slate-200 dark:border-slate-800', dot: 'bg-slate-400' },
  { key: 'PHONE_SCREEN', label: 'Phone Screen', bg: 'bg-blue-50 dark:bg-blue-950', border: 'border-blue-200 dark:border-blue-800', dot: 'bg-blue-500' },
  { key: 'TECHNICAL', label: 'Technical', bg: 'bg-purple-50 dark:bg-purple-950', border: 'border-purple-200 dark:border-purple-800', dot: 'bg-purple-500' },
  { key: 'ONSITE', label: 'On-site', bg: 'bg-amber-50 dark:bg-amber-950', border: 'border-amber-200 dark:border-amber-800', dot: 'bg-amber-500' },
  { key: 'OFFER', label: 'Offer', bg: 'bg-green-50 dark:bg-green-950', border: 'border-green-200 dark:border-green-800', dot: 'bg-green-500' },
  { key: 'REJECTED', label: 'Rejected', bg: 'bg-red-50 dark:bg-red-950', border: 'border-red-200 dark:border-red-800', dot: 'bg-red-500' },
  { key: 'ACCEPTED', label: 'Accepted', bg: 'bg-emerald-50 dark:bg-emerald-950', border: 'border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-500' },
] as const

export default function InterviewsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const interviews = trpc.interviews.listByCampaign.useQuery({ campaignId: id })
  const updateStage = trpc.interviews.updateStage.useMutation({
    onSuccess: () => { interviews.refetch(); toast.success('Stage updated') },
    onError: (e) => toast.error(e.message),
  })

  const companies = interviews.data ?? []

  const getNextStage = (current: string): string | null => {
    const idx = STAGES.findIndex((s) => s.key === current)
    if (idx < 0 || idx >= STAGES.length - 1) return null
    const next = STAGES[idx + 1]
    return next.key === 'REJECTED' ? STAGES[idx + 2]?.key ?? null : next.key
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1400px] mx-auto px-4 py-8">
        <DashboardSubpageHeader
          title="Interview Pipeline"
          description="Track your application progress per company."
        />

        {companies.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Building2 className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="font-medium">No companies in the pipeline yet.</p>
              <p className="text-sm mt-1">Companies will appear here after you send emails.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-3" style={{ minWidth: STAGES.length * 200 }}>
              {STAGES.map((stage) => {
                const stageCompanies = companies.filter((c) => c.currentStage === stage.key)
                return (
                  <div key={stage.key} className={`flex-1 min-w-[180px] rounded-lg ${stage.bg} border ${stage.border} p-3`}>
                    {/* Column header */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`h-2.5 w-2.5 rounded-full ${stage.dot}`} />
                      <h3 className="text-sm font-semibold">{stage.label}</h3>
                      <Badge variant="secondary" className="text-[10px] h-5 ml-auto">{stageCompanies.length}</Badge>
                    </div>

                    {/* Cards */}
                    <div className="space-y-2 min-h-[120px]">
                      {stageCompanies.map((company) => {
                        const nextStage = getNextStage(company.currentStage)
                        return (
                          <Card key={company.id} className="shadow-sm">
                            <CardContent className="p-3 space-y-2.5">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <span className="text-sm font-medium truncate">{company.name}</span>
                                </div>
                                {company.contactEmail && (
                                  <p className="text-[11px] text-muted-foreground truncate mt-0.5 pl-5">{company.contactEmail}</p>
                                )}
                              </div>
                              <div className="flex gap-1.5">
                                {nextStage && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs px-2 flex-1"
                                    onClick={() => updateStage.mutate({ companyId: company.id, stage: nextStage as typeof STAGES[number]['key'] })}
                                    disabled={updateStage.isPending}
                                  >
                                    <ChevronRight className="h-3 w-3 mr-0.5" />
                                    {STAGES.find((s) => s.key === nextStage)?.label}
                                  </Button>
                                )}
                                {company.currentStage !== 'REJECTED' && company.currentStage !== 'ACCEPTED' && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 px-0 text-muted-foreground hover:text-destructive"
                                    title="Reject"
                                    onClick={() => updateStage.mutate({ companyId: company.id, stage: 'REJECTED' })}
                                    disabled={updateStage.isPending}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
