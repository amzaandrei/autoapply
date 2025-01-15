'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import {
  Search,
  Plus,
  Trash2,
  Loader2,
  Building2,
  ArrowRight,
  CheckCircle,
  Globe,
  Sparkles,
} from 'lucide-react'

interface DiscoveredCompany {
  name: string
  domain: string
  industry: string
  size: string
  description: string
  contactEmail: string | null
  contactName: string | null
  linkedIn: string | null
  matchReason: string
}

export default function DiscoverPage() {
  const router = useRouter()

  // Campaign setup
  const [campaignName, setCampaignName] = useState('')
  const [campaignId, setCampaignId] = useState<string | null>(null)

  // AI Discovery
  const [jobTitle, setJobTitle] = useState('')
  const [industry, setIndustry] = useState('')
  const [region, setRegion] = useState('')
  const [discovering, setDiscovering] = useState(false)
  const [discovered, setDiscovered] = useState<DiscoveredCompany[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())

  // Manual add
  const [manualName, setManualName] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [showManual, setShowManual] = useState(false)

  const profile = trpc.profile.get.useQuery()
  const createCampaign = trpc.campaigns.create.useMutation({
    onSuccess: (c) => {
      setCampaignId(c.id)
      // Pre-fill from profile
      if (profile.data?.jobTitle) setJobTitle(profile.data.jobTitle)
      toast.success('Campaign created')
    },
    onError: (e) => toast.error(e.message),
  })

  const companies = trpc.companies.list.useQuery(
    { campaignId: campaignId! },
    { enabled: !!campaignId }
  )

  const addCompany = trpc.companies.create.useMutation({
    onSuccess: () => {
      companies.refetch()
      setManualName('')
      setManualEmail('')
      toast.success('Company added')
    },
    onError: (e) => toast.error(e.message),
  })

  const deleteCompany = trpc.companies.delete.useMutation({
    onSuccess: () => { companies.refetch(); toast.success('Removed') },
  })

  const bulkCreate = trpc.companies.bulkCreate.useMutation({
    onSuccess: (result) => {
      companies.refetch()
      setDiscovered([])
      setSelected(new Set())
      toast.success(`${result.count} companies added to campaign`)
    },
    onError: (e) => toast.error(e.message),
  })

  const handleDiscover = async () => {
    if (!campaignId) { toast.error('Create a campaign first'); return }
    if (!jobTitle || !industry || !region) {
      toast.error('Fill in job title, industry, and region to search')
      return
    }
    setDiscovering(true)
    try {
      const res = await fetch('/api/companies/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, jobTitle, industry, region }),
      })
      const data = await res.json() as { companies?: DiscoveredCompany[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Discovery failed')
      if (data.companies && data.companies.length > 0) {
        setDiscovered(data.companies)
        setSelected(new Set(data.companies.map((_, i) => i)))
        toast.success(`Found ${data.companies.length} matching companies`)
      } else {
        toast.info("We're not finding matches — let's fix that. Try loosening your criteria.")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Discovery failed')
    } finally {
      setDiscovering(false)
    }
  }

  const handleAddSelected = () => {
    if (!campaignId || selected.size === 0) return
    const toAdd = [...selected].map((i) => discovered[i]).filter(Boolean)
    bulkCreate.mutate({
      campaignId,
      companies: toAdd.map((c) => ({
        name: c.name,
        domain: c.domain || undefined,
        industry: c.industry || undefined,
        contactEmail: c.contactEmail || undefined,
      })),
    })
  }

  const toggleSelect = (i: number) => {
    const next = new Set(selected)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setSelected(next)
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8 text-sm text-muted-foreground">
          <span className="line-through">1 Upload CV</span>
          <ArrowRight className="h-4 w-4" />
          <span className="font-semibold text-primary">2 Discover</span>
          <ArrowRight className="h-4 w-4" />
          <span>3 Generate</span>
          <ArrowRight className="h-4 w-4" />
          <span>4 Review</span>
          <ArrowRight className="h-4 w-4" />
          <span>5 Send</span>
        </div>

        {/* Step 1: Create campaign */}
        {!campaignId ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Tell us what you&apos;re after.</CardTitle>
              <CardDescription>
                Set your criteria once — AutoApply won&apos;t waste applications on roles that don&apos;t fit.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Campaign Name</Label>
                <Input
                  placeholder="e.g. Senior Dev Q1 2026"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => createCampaign.mutate({ name: campaignName })}
                disabled={!campaignName || createCampaign.isPending}
              >
                {createCampaign.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
                ) : (
                  'Create Campaign'
                )}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* AI Discovery */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  AI Company Discovery
                </CardTitle>
                <CardDescription>
                  AutoApply searches the web for companies actively hiring in your space.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Job Title</Label>
                    <Input
                      placeholder="e.g. Backend Engineer"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Industry</Label>
                    <Input
                      placeholder="e.g. AI, Fintech, SaaS"
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Region</Label>
                    <Input
                      placeholder="e.g. London, Remote"
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => void handleDiscover()}
                  disabled={discovering}
                >
                  {discovering ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Searching the web...</>
                  ) : (
                    <><Search className="h-4 w-4 mr-2" /> Discover Companies</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Discovery Results */}
            {discovered.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>
                      {discovered.length} companies found
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        ({selected.size} selected)
                      </span>
                    </CardTitle>
                    <Button
                      size="sm"
                      onClick={handleAddSelected}
                      disabled={selected.size === 0 || bulkCreate.isPending}
                    >
                      {bulkCreate.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        `Add ${selected.size} to Campaign`
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {discovered.map((company, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selected.has(i)
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-muted-foreground/50'
                      }`}
                      onClick={() => toggleSelect(i)}
                    >
                      <div
                        className={`mt-0.5 h-4 w-4 rounded-sm border flex items-center justify-center shrink-0 ${
                          selected.has(i) ? 'bg-primary border-primary' : 'border-input'
                        }`}
                      >
                        {selected.has(i) && <CheckCircle className="h-3 w-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{company.name}</span>
                          {company.industry && (
                            <Badge variant="secondary" className="text-xs">{company.industry}</Badge>
                          )}
                          {company.size && (
                            <Badge variant="outline" className="text-xs">{company.size}</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">{company.description}</p>
                        <p className="text-xs text-primary mt-1">{company.matchReason}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {company.domain && (
                            <span className="flex items-center gap-1">
                              <Globe className="h-3 w-3" /> {company.domain}
                            </span>
                          )}
                          {company.contactEmail && (
                            <span>{company.contactEmail}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Campaign Companies */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Campaign Companies
                    <Badge variant="secondary">{companies.data?.length ?? 0}</Badge>
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowManual(!showManual)}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add Manually
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Manual add form */}
                {showManual && (
                  <div className="flex gap-2 p-3 bg-muted/50 rounded-lg">
                    <Input
                      placeholder="Company name"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                    />
                    <Input
                      placeholder="Contact email (optional)"
                      value={manualEmail}
                      onChange={(e) => setManualEmail(e.target.value)}
                      type="email"
                    />
                    <Button
                      size="sm"
                      onClick={() =>
                        addCompany.mutate({
                          campaignId: campaignId!,
                          name: manualName,
                          contactEmail: manualEmail || undefined,
                        })
                      }
                      disabled={!manualName || addCompany.isPending}
                    >
                      Add
                    </Button>
                  </div>
                )}

                {/* Companies list */}
                {companies.data && companies.data.length > 0 ? (
                  <div className="space-y-2">
                    {companies.data.map((company) => (
                      <div
                        key={company.id}
                        className="flex items-center justify-between p-3 rounded-md border"
                      >
                        <div>
                          <p className="font-medium text-sm">{company.name}</p>
                          {company.contactEmail && (
                            <p className="text-xs text-muted-foreground">{company.contactEmail}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={company.status === 'PENDING' ? 'secondary' : 'default'}
                            className="text-xs"
                          >
                            {company.status.toLowerCase()}
                          </Badge>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteCompany.mutate({ id: company.id })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nothing sent yet — but that&apos;s about to change.</p>
                    <p className="text-xs mt-1">Use AI discovery above or add companies manually.</p>
                  </div>
                )}

                <Separator />
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => router.push(`/generate?campaignId=${campaignId}`)}
                  disabled={!companies.data?.length}
                >
                  Continue to Email Generation
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
