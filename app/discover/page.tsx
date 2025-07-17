'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { StepIndicator } from '@/components/StepIndicator'
import { AutocompleteInput } from '@/components/AutocompleteInput'
import { MultiSelectInput } from '@/components/MultiSelectInput'
import { RegionPicker } from '@/components/RegionPicker'
import { SaveTemplateDialog } from '@/components/SaveTemplateDialog'
import { EmailVerificationBadge } from '@/components/EmailVerificationBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
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
  Crosshair,
  Target,
  Radar,
  BriefcaseBusiness,
  Cpu,
  Layers,
} from 'lucide-react'

const JOB_TITLE_SUGGESTIONS = [
  'Software Engineer', 'Senior Software Engineer', 'Staff Software Engineer',
  'Frontend Developer', 'Backend Developer', 'Full Stack Developer',
  'Mobile Developer', 'iOS Developer', 'Android Developer',
  'DevOps Engineer', 'Site Reliability Engineer', 'Cloud Engineer', 'Platform Engineer',
  'Data Engineer', 'Data Scientist', 'Machine Learning Engineer', 'AI Engineer',
  'Product Manager', 'Technical Product Manager', 'Product Designer',
  'UX Designer', 'UI Designer', 'UX Researcher',
  'Engineering Manager', 'Tech Lead', 'VP of Engineering', 'CTO',
  'QA Engineer', 'Test Automation Engineer', 'Security Engineer',
  'Solutions Architect', 'Technical Writer', 'Developer Advocate',
  'Blockchain Developer', 'Embedded Systems Engineer', 'Firmware Engineer',
  'Game Developer', 'Graphics Engineer', 'Systems Programmer',
  'Database Administrator', 'Network Engineer', 'IT Administrator',
  'Business Analyst', 'Scrum Master', 'Agile Coach',
  'Marketing Manager', 'Growth Engineer', 'Sales Engineer',
]

const INDUSTRY_SUGGESTIONS = [
  'AI / Machine Learning', 'Fintech', 'SaaS', 'Cybersecurity',
  'E-commerce', 'EdTech', 'HealthTech', 'BioTech', 'MedTech',
  'Climate Tech', 'Clean Energy', 'GreenTech',
  'Gaming', 'Entertainment', 'Media', 'AdTech',
  'Logistics', 'Supply Chain', 'PropTech', 'Real Estate',
  'InsurTech', 'LegalTech', 'RegTech', 'GovTech',
  'Robotics', 'IoT', 'Hardware', 'Semiconductors',
  'Telecom', 'Networking', 'Cloud Infrastructure',
  'HR Tech', 'Recruitment', 'Workforce Management',
  'Travel Tech', 'FoodTech', 'AgriTech',
  'Blockchain', 'Web3', 'Crypto', 'DeFi',
  'Aerospace', 'Defence', 'Automotive',
  'Consulting', 'Professional Services', 'Agency',
  'Social Media', 'Developer Tools', 'Open Source',
  'Banking', 'Payments', 'Wealth Management',
]


const CAMPAIGN_ROLE_SUGGESTIONS = [
  'Software Engineer', 'Senior Software Engineer', 'Staff Software Engineer',
  'Frontend Developer', 'Backend Developer', 'Full Stack Developer',
  'Mobile Engineer', 'iOS Developer', 'Android Developer', 'React Native Developer',
  'DevOps Engineer', 'Site Reliability Engineer', 'Cloud Engineer', 'Platform Engineer',
  'Data Engineer', 'Data Scientist', 'Data Analyst', 'Machine Learning Engineer', 'AI Engineer',
  'Product Manager', 'Technical Product Manager', 'Product Designer',
  'UX Designer', 'UI Designer', 'UX Researcher',
  'Engineering Manager', 'Tech Lead', 'VP of Engineering', 'CTO',
  'QA Engineer', 'Test Automation Engineer', 'Security Engineer',
  'Solutions Architect', 'Technical Writer', 'Developer Advocate',
  'Blockchain Developer', 'Embedded Systems Engineer',
  'Game Developer', 'Systems Programmer',
  'Database Administrator', 'Network Engineer',
  'Business Analyst', 'Scrum Master', 'Growth Engineer', 'Sales Engineer',
]

type SearchMode = 'all' | 'top10' | 'best3'

const SEARCH_MODES: { value: SearchMode; label: string; desc: string; icon: typeof Radar }[] = [
  { value: 'all',   label: 'Cast a Wide Net',    desc: '15-25 companies — apply everywhere', icon: Radar },
  { value: 'top10', label: 'Top 10 Matches',     desc: '10 most relevant companies',         icon: Target },
  { value: 'best3', label: 'Best 3 For Me',      desc: '3 strongest fits for your profile',  icon: Crosshair },
]

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
  alreadyContacted?: boolean
  salaryRange?: string | null
}

function DiscoverPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlCampaignId = searchParams.get('campaignId')
  const urlTemplateId = searchParams.get('templateId')

  // Campaign setup
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [campaignId, setCampaignId] = useState<string | null>(urlCampaignId)
  const [loadedFromTemplate, setLoadedFromTemplate] = useState(false)
  const [autoFilled, setAutoFilled] = useState(false)
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)

  // AI Discovery
  const [jobTitle, setJobTitle] = useState('')
  const [industry, setIndustry] = useState('')
  const [region, setRegion] = useState('')
  const [searchMode, setSearchMode] = useState<SearchMode>('top10')
  const [dataSource, setDataSource] = useState<'ai' | 'jobs' | 'both'>('both')
  const [discovering, setDiscovering] = useState(false)
  const [discovered, setDiscovered] = useState<DiscoveredCompany[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())

  // Manual add
  const [manualName, setManualName] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [showManual, setShowManual] = useState(false)

  // Template toggle (campaign-local, initialized from profile)
  const [useTemplate, setUseTemplate] = useState<boolean | null>(null)
  const [hydrated, setHydrated] = useState(!urlCampaignId)

  const profile = trpc.profile.get.useQuery()
  const existingCampaign = trpc.campaigns.getById.useQuery(
    { id: campaignId! },
    { enabled: !!campaignId }
  )
  const template = trpc.templates.getById.useQuery(
    { id: urlTemplateId! },
    { enabled: !!urlTemplateId && !campaignId }
  )
  const lastDefaults = trpc.templates.getLastCampaignDefaults.useQuery(
    undefined,
    { enabled: !urlCampaignId && !urlTemplateId }
  )
  const updateCampaign = trpc.campaigns.update.useMutation({
    onSuccess: () => existingCampaign.refetch(),
  })
  const saveTemplate = trpc.templates.create.useMutation({
    onSuccess: () => toast.success('Template saved'),
    onError: (e) => toast.error(e.message),
  })

  // Hydrate state from existing campaign when navigating back
  if (existingCampaign.data && !hydrated) {
    const c = existingCampaign.data
    if (c.name) setSelectedRoles(c.name.split(', ').filter(Boolean))
    if (c.jobTitle) setJobTitle(c.jobTitle)
    if (c.industry) setIndustry(c.industry)
    if (c.region) setRegion(c.region)
    setUseTemplate(c.useEmailTemplate)
    setHydrated(true)
  }

  // Hydrate from template when ?templateId is present
  if (template.data && !loadedFromTemplate && !campaignId) {
    const t = template.data
    if (t.selectedRoles.length > 0) setSelectedRoles(t.selectedRoles)
    if (t.jobTitle) setJobTitle(t.jobTitle)
    if (t.industry) setIndustry(t.industry)
    if (t.region) setRegion(t.region)
    if (t.searchMode) setSearchMode(t.searchMode as SearchMode)
    if (t.dataSource) setDataSource(t.dataSource as 'ai' | 'jobs' | 'both')
    setUseTemplate(t.useEmailTemplate)
    setLoadedFromTemplate(true)
  }

  // Auto-fill from last campaign on fresh new campaign
  if (lastDefaults.data && !autoFilled && !campaignId && !urlTemplateId) {
    const d = lastDefaults.data
    if (d.selectedRoles.length > 0) setSelectedRoles(d.selectedRoles)
    if (d.jobTitle) setJobTitle(d.jobTitle)
    if (d.industry) setIndustry(d.industry)
    if (d.region) setRegion(d.region)
    setUseTemplate(d.useEmailTemplate)
    setAutoFilled(true)
  }

  // Initialized from profile, then lives on the campaign
  const resolvedUseTemplate = useTemplate ?? profile.data?.useEmailTemplate ?? false
  const createCampaign = trpc.campaigns.create.useMutation({
    onSuccess: (c) => {
      setCampaignId(c.id)
      // Pre-fill job title from selected roles
      setJobTitle(selectedRoles.join(', ') || profile.data?.jobTitle || '')
      // Seed campaign template setting from profile default
      setUseTemplate(c.useEmailTemplate)
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
    if (!jobTitle || !region) {
      toast.error('Fill in at least a job title and region to search')
      return
    }
    // Persist the current search criteria onto the campaign so templates
    // saved later (and autopilot) can inherit them.
    const existing = existingCampaign.data
    if (
      existing &&
      (existing.jobTitle !== jobTitle || existing.industry !== (industry || null) || existing.region !== region)
    ) {
      updateCampaign.mutate({
        id: campaignId,
        jobTitle: jobTitle || undefined,
        industry: industry || undefined,
        region: region || undefined,
      })
    }
    setDiscovering(true)
    try {
      const res = await fetch('/api/companies/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, jobTitle, industry: industry || 'Any industry', region, searchMode, source: dataSource }),
      })
      const data = await res.json() as { companies?: DiscoveredCompany[]; droppedUnverified?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Discovery failed')
      const dropped = data.droppedUnverified ?? 0
      if (data.companies && data.companies.length > 0) {
        setDiscovered(data.companies)
        // Pre-select only new companies — skip those already contacted
        const newCompanyIndices = data.companies
          .map((c, i) => ({ contacted: c.alreadyContacted, i }))
          .filter((x) => !x.contacted)
          .map((x) => x.i)
        setSelected(new Set(newCompanyIndices))
        const contactedCount = data.companies.filter((c) => c.alreadyContacted).length
        const droppedSuffix = dropped > 0 ? ` — ${dropped} dropped (unverified email)` : ''
        if (contactedCount > 0) {
          toast.success(`Found ${data.companies.length} verified companies${droppedSuffix} — ${contactedCount} already contacted (greyed out)`)
        } else {
          toast.success(`Found ${data.companies.length} verified companies${droppedSuffix}`)
        }
      } else if (dropped > 0) {
        toast.info(`Found ${dropped} candidates but none had a verifiable contact email. Try a different region or broader criteria.`)
      } else {
        toast.info("We're not finding matches — let's fix that. Try loosening your criteria.")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Discovery failed')
    } finally {
      setDiscovering(false)
    }
  }

  const handleAddSelected = async () => {
    if (!campaignId || selected.size === 0) return
    const toAdd = [...selected].map((i) => discovered[i]).filter(Boolean)

    // Check for duplicates across campaigns
    try {
      const names = toAdd.map((c) => c.name)
      const res = await fetch(`/api/trpc/companies.checkDuplicates?input=${encodeURIComponent(JSON.stringify({ json: { names } }))}`)
      const data = await res.json()
      const dupes = data?.result?.data?.json as Array<{ name: string; campaignName: string }> | undefined
      if (dupes && dupes.length > 0) {
        const dupeNames = dupes.map((d) => `${d.name} (in "${d.campaignName}")`).join(', ')
        toast.warning(`Already in other campaigns: ${dupeNames}`)
      }
    } catch {
      // Non-blocking — proceed even if check fails
    }

    bulkCreate.mutate({
      campaignId,
      companies: toAdd.map((c) => ({
        name: c.name,
        domain: c.domain || undefined,
        industry: c.industry || undefined,
        size: c.size || undefined,
        description: c.description ? `${c.description}\n\nMatch reason: ${c.matchReason}` : undefined,
        contactEmail: c.contactEmail || undefined,
        contactName: c.contactName || undefined,
        linkedIn: c.linkedIn || undefined,
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
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" onClick={() => router.push('/dashboard')}>← Back to Dashboard</Button>
        <StepIndicator currentStep={2} campaignId={campaignId ?? undefined} />

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
                <Label>What roles are you interested in?</Label>
                <MultiSelectInput
                  placeholder="Type or pick roles..."
                  selected={selectedRoles}
                  onChange={setSelectedRoles}
                  suggestions={CAMPAIGN_ROLE_SUGGESTIONS}
                />
                <p className="text-xs text-muted-foreground">
                  Select one or more — this becomes your campaign name and pre-fills the job title search.
                </p>
              </div>
              {(template.data || autoFilled) && (
                <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-primary flex items-center gap-1.5">
                  <Layers className="h-3 w-3" />
                  {template.data ? `Loaded from template: ${template.data.name}` : 'Pre-filled from your last campaign'}
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => {
                    const t = template.data
                    createCampaign.mutate({
                      name: selectedRoles.join(', '),
                      jobTitle: t?.jobTitle || jobTitle || undefined,
                      industry: t?.industry || industry || undefined,
                      region: t?.region || region || undefined,
                      useEmailTemplate: t?.useEmailTemplate ?? profile.data?.useEmailTemplate ?? false,
                      attachCv: t?.attachCv,
                      followUpEnabled: t?.followUpEnabled,
                      followUpDelayDays: t?.followUpDelayDays,
                      maxFollowUps: t?.maxFollowUps,
                      abTestEnabled: t?.abTestEnabled,
                      abToneA: t?.abToneA as 'concise' | 'balanced' | 'detailed' | undefined,
                      abToneB: t?.abToneB as 'concise' | 'balanced' | 'detailed' | undefined,
                    })
                  }}
                  disabled={selectedRoles.length === 0 || createCampaign.isPending}
                >
                  {createCampaign.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
                  ) : (
                    'Create Campaign'
                  )}
                </Button>
                {selectedRoles.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => setSaveTemplateOpen(true)}
                    disabled={createCampaign.isPending}
                  >
                    <Layers className="h-3.5 w-3.5 mr-1.5" /> Save as Template
                  </Button>
                )}
              </div>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Job Title</Label>
                    <AutocompleteInput
                      placeholder="e.g. Backend Engineer"
                      value={jobTitle}
                      onChange={setJobTitle}
                      suggestions={JOB_TITLE_SUGGESTIONS}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Industry <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <AutocompleteInput
                      placeholder="Any industry"
                      value={industry}
                      onChange={setIndustry}
                      suggestions={INDUSTRY_SUGGESTIONS}
                    />
                  </div>
                </div>

                {/* Region picker */}
                <div className="space-y-2">
                  <Label>Where do you want to work?</Label>
                  <RegionPicker value={region} onChange={setRegion} />
                </div>

                {/* Data source selector */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">Where to search</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { value: 'jobs' as const, label: 'Job Boards', desc: 'Real postings from LinkedIn, Indeed, Glassdoor', icon: BriefcaseBusiness },
                      { value: 'ai' as const, label: 'AI Search', desc: 'Claude searches the web for hiring companies', icon: Cpu },
                      { value: 'both' as const, label: 'Combined', desc: 'Job boards + AI merged together', icon: Layers },
                    ]).map((src) => {
                      const Icon = src.icon
                      const active = dataSource === src.value
                      return (
                        <button
                          key={src.value}
                          type="button"
                          onClick={() => setDataSource(src.value)}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-colors text-center ${
                            active ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50'
                          }`}
                        >
                          <Icon className={`h-5 w-5 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                          <span className={`text-sm font-medium ${active ? 'text-primary' : ''}`}>{src.label}</span>
                          <span className="text-[11px] text-muted-foreground leading-tight">{src.desc}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Search mode selector */}
                <div className="grid grid-cols-3 gap-2">
                  {SEARCH_MODES.map((mode) => {
                    const Icon = mode.icon
                    const active = searchMode === mode.value
                    return (
                      <button
                        key={mode.value}
                        type="button"
                        onClick={() => setSearchMode(mode.value)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-colors text-center ${
                          active
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-muted-foreground/50'
                        }`}
                      >
                        <Icon className={`h-5 w-5 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className={`text-sm font-medium ${active ? 'text-primary' : ''}`}>{mode.label}</span>
                        <span className="text-[11px] text-muted-foreground leading-tight">{mode.desc}</span>
                      </button>
                    )
                  })}
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
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                        company.alreadyContacted
                          ? 'border-border bg-muted/30 opacity-60 cursor-not-allowed'
                          : selected.has(i)
                            ? 'border-primary bg-primary/5 cursor-pointer'
                            : 'border-border hover:border-muted-foreground/50 cursor-pointer'
                      }`}
                      onClick={() => { if (!company.alreadyContacted) toggleSelect(i) }}
                    >
                      <div
                        className={`mt-0.5 h-4 w-4 rounded-sm border flex items-center justify-center shrink-0 ${
                          company.alreadyContacted
                            ? 'bg-muted border-muted-foreground/30'
                            : selected.has(i) ? 'bg-primary border-primary' : 'border-input'
                        }`}
                      >
                        {selected.has(i) && !company.alreadyContacted && <CheckCircle className="h-3 w-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{company.name}</span>
                          {company.alreadyContacted && (
                            <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                              Already applied
                            </Badge>
                          )}
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
                      {company.salaryRange && (
                        <div
                          className="shrink-0 ml-2 flex items-center gap-1 px-2.5 py-1 rounded-md border border-green-500/40 bg-green-50 dark:bg-green-950/30 text-foreground dark:text-foreground text-xs font-semibold whitespace-nowrap max-w-[140px]"
                          title={company.salaryRange.startsWith('~') ? 'Estimated salary range' : 'From live job posting'}
                        >
                          <span>💰</span>
                          <span className="truncate">{company.salaryRange}</span>
                        </div>
                      )}
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
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowManual(false)
                        setManualName('')
                        setManualEmail('')
                      }}
                    >
                      Cancel
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
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <p className="text-xs text-muted-foreground">{company.contactEmail}</p>
                              <EmailVerificationBadge
                                status={company.contactEmailStatus}
                                score={company.contactEmailScore}
                              />
                            </div>
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
                    <p className="text-sm">No companies added yet. Search above to find matching companies.</p>
                  </div>
                )}

                <Separator />

                {/* Email mode toggle */}
                <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/50">
                  <div className="space-y-0.5">
                    <Label htmlFor="templateToggle" className="text-sm font-medium cursor-pointer">
                      {resolvedUseTemplate ? 'Using your email template' : 'Using AI-generated emails'}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {resolvedUseTemplate
                        ? 'Your custom template will be filled for each company. A/B testing and follow-ups require AI mode.'
                        : 'AI writes a unique personalized email per company.'}
                    </p>
                  </div>
                  <Switch
                    id="templateToggle"
                    checked={resolvedUseTemplate}
                    onCheckedChange={(checked) => {
                      setUseTemplate(checked)
                      if (campaignId) {
                        updateCampaign.mutate({
                          id: campaignId,
                          useEmailTemplate: checked,
                          ...(checked ? { abTestEnabled: false, followUpEnabled: false } : {}),
                        })
                      }
                      toast.success(checked ? 'Switched to your template' : 'Switched to AI emails')
                    }}
                  />
                </div>

                {/* CV attachment toggle */}
                <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/50">
                  <div className="space-y-0.5">
                    <Label htmlFor="attachCvToggle" className="text-sm font-medium cursor-pointer">
                      Attach CV to emails
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Your CV PDF will be attached to every outgoing email.
                    </p>
                  </div>
                  <Switch
                    id="attachCvToggle"
                    checked={existingCampaign.data?.attachCv ?? true}
                    onCheckedChange={(checked) => {
                      if (campaignId) updateCampaign.mutate({ id: campaignId, attachCv: checked })
                    }}
                  />
                </div>

                {/* Follow-up settings */}
                {(
                  <div className={`p-3 rounded-lg bg-muted/50 space-y-3 transition-opacity ${resolvedUseTemplate ? 'opacity-50' : ''}`}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <Label htmlFor="followUpToggle" className="text-sm font-medium cursor-pointer">
                          Auto follow-ups
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {resolvedUseTemplate
                            ? 'Requires AI-generated emails — switch off the template toggle above.'
                            : 'Send follow-ups if no reply after a set number of days.'}
                        </p>
                      </div>
                      <Switch
                        id="followUpToggle"
                        disabled={resolvedUseTemplate}
                        checked={existingCampaign.data?.followUpEnabled ?? false}
                        onCheckedChange={(checked) => {
                          if (campaignId) updateCampaign.mutate({ id: campaignId, followUpEnabled: checked })
                        }}
                      />
                    </div>
                    {existingCampaign.data?.followUpEnabled && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Days before follow-up</Label>
                          <Input
                            type="number"
                            min={1}
                            max={30}
                            value={existingCampaign.data.followUpDelayDays}
                            onChange={(e) => {
                              if (campaignId) updateCampaign.mutate({ id: campaignId, followUpDelayDays: parseInt(e.target.value) || 5 })
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Max follow-ups (1-3)</Label>
                          <Input
                            type="number"
                            min={1}
                            max={3}
                            value={existingCampaign.data.maxFollowUps}
                            onChange={(e) => {
                              if (campaignId) updateCampaign.mutate({ id: campaignId, maxFollowUps: parseInt(e.target.value) || 1 })
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* A/B testing settings */}
                {(
                  <div className={`p-3 rounded-lg bg-muted/50 space-y-3 transition-opacity ${resolvedUseTemplate ? 'opacity-50' : ''}`}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <Label htmlFor="abToggle" className="text-sm font-medium cursor-pointer">
                          A/B test email tones
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {resolvedUseTemplate
                            ? 'Requires AI-generated emails — switch off the template toggle above.'
                            : 'Generate 2 variants per company to find what works best.'}
                        </p>
                      </div>
                      <Switch
                        id="abToggle"
                        disabled={resolvedUseTemplate}
                        checked={existingCampaign.data?.abTestEnabled ?? false}
                        onCheckedChange={(checked) => {
                          if (campaignId) updateCampaign.mutate({ id: campaignId, abTestEnabled: checked })
                        }}
                      />
                    </div>
                    {existingCampaign.data?.abTestEnabled && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Variant A</Label>
                          <select
                            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                            value={existingCampaign.data.abToneA}
                            onChange={(e) => {
                              if (campaignId) updateCampaign.mutate({ id: campaignId, abToneA: e.target.value as 'concise' | 'balanced' | 'detailed' })
                            }}
                          >
                            <option value="concise">Short & Direct</option>
                            <option value="balanced">Balanced</option>
                            <option value="detailed">In-Depth</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Variant B</Label>
                          <select
                            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                            value={existingCampaign.data.abToneB}
                            onChange={(e) => {
                              if (campaignId) updateCampaign.mutate({ id: campaignId, abToneB: e.target.value as 'concise' | 'balanced' | 'detailed' })
                            }}
                          >
                            <option value="concise">Short & Direct</option>
                            <option value="balanced">Balanced</option>
                            <option value="detailed">In-Depth</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => router.push(`/generate?campaignId=${campaignId}`)}
                  disabled={!companies.data?.length}
                >
                  {resolvedUseTemplate
                    ? 'Continue to Email Preparation'
                    : 'Continue to Email Generation'}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

      </div>

      <SaveTemplateDialog
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        defaultName={selectedRoles.join(', ')}
        onSave={async (name) => {
          await saveTemplate.mutateAsync({
            name,
            selectedRoles,
            jobTitle: jobTitle || existingCampaign.data?.jobTitle || undefined,
            industry: industry || existingCampaign.data?.industry || undefined,
            region: region || existingCampaign.data?.region || undefined,
            searchMode,
            dataSource,
            useEmailTemplate: resolvedUseTemplate,
            attachCv: existingCampaign.data?.attachCv ?? true,
            followUpEnabled: existingCampaign.data?.followUpEnabled ?? false,
            followUpDelayDays: existingCampaign.data?.followUpDelayDays,
            maxFollowUps: existingCampaign.data?.maxFollowUps,
            abTestEnabled: existingCampaign.data?.abTestEnabled ?? false,
            abToneA: existingCampaign.data?.abToneA as 'concise' | 'balanced' | 'detailed' | undefined,
            abToneB: existingCampaign.data?.abToneB as 'concise' | 'balanced' | 'detailed' | undefined,
          })
        }}
      />
    </div>
  )
}

export default function DiscoverPageWrapper() {
  return (
    <Suspense>
      <DiscoverPage />
    </Suspense>
  )
}
