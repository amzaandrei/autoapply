import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { discoverCompanies, type CompanyResult } from '@/lib/ai'
import { searchAllJobAPIs } from '@/lib/job-apis'
import { validateEmails } from '@/lib/email-validator'
import { estimateSalary } from '@/lib/salary-estimator'
import { rateLimit } from '@/lib/rate-limit'
import { geocodeForwardBatch } from '@/lib/geocode-cache'
import { addOpportunityLocations, invalidateAppliedCache } from '@/server/routers/regions'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json() as {
      campaignId: string
      jobTitle: string
      industry: string
      region: string
      additionalContext?: string
      saveResults?: boolean
      searchMode?: 'all' | 'top10' | 'best3'
      source?: 'ai' | 'jobs' | 'both'
    }

    const { campaignId, jobTitle, industry, region, additionalContext, saveResults, searchMode, source = 'ai' } = body

    if (!campaignId || !jobTitle || !region) {
      return NextResponse.json(
        { error: 'campaignId, jobTitle, and region are required' },
        { status: 400 }
      )
    }

    // Rate limit: max 30 discovery searches per hour
    const limit = rateLimit(`discover:${session.user.id}`, 30, 60 * 60 * 1000)
    if (!limit.allowed) {
      return NextResponse.json({
        error: `Too many searches. Try again in ${Math.ceil(limit.resetIn / 60)} minutes.`,
      }, { status: 429 })
    }

    // Verify campaign
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, userId: session.user.id },
    })
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    let companies: CompanyResult[] = []

    if (source === 'ai') {
      companies = await discoverCompanies({ jobTitle, industry, region, additionalContext, searchMode })
    } else if (source === 'jobs') {
      companies = await searchAllJobAPIs(jobTitle, region, searchMode)
    } else {
      // 'both' — fetch in parallel, merge, dedup by company name
      const [aiResults, jobResults] = await Promise.all([
        discoverCompanies({ jobTitle, industry, region, additionalContext, searchMode }),
        searchAllJobAPIs(jobTitle, region, searchMode),
      ])
      const seen = new Set<string>()
      companies = [...jobResults, ...aiResults].filter((c) => {
        const key = c.name.toLowerCase().trim()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    }

    // Filter out blacklisted companies entirely (previous bounces, manually blacklisted, etc.)
    const blacklist = await prisma.blacklistedCompany.findMany({
      where: { userId: session.user.id },
      select: { name: true, domain: true },
    })
    const blacklistNames = new Set(blacklist.map((b) => b.name.toLowerCase()))
    const blacklistDomains = new Set(blacklist.map((b) => b.domain?.toLowerCase()).filter(Boolean) as string[])
    companies = companies.filter((c) => {
      if (blacklistNames.has(c.name.toLowerCase())) return false
      if (c.domain && blacklistDomains.has(c.domain.toLowerCase())) return false
      return true
    })

    // Validate contact emails — filter out companies with invalid/non-existent email addresses
    const emailsToValidate = companies.map((c) => c.contactEmail).filter(Boolean) as string[]
    if (emailsToValidate.length > 0) {
      const validations = await validateEmails(emailsToValidate)
      const invalidEmails = new Set(validations.filter((v) => !v.valid).map((v) => v.email.toLowerCase()))
      companies = companies.map((c) => {
        if (c.contactEmail && invalidEmails.has(c.contactEmail.toLowerCase())) {
          return { ...c, contactEmail: null }
        }
        return c
      })
    }

    // Tag companies that were already contacted across any campaign
    const previouslySent = await prisma.generatedEmail.findMany({
      where: {
        campaign: { userId: session.user.id },
        status: { in: ['SENT', 'OPENED', 'REPLIED'] },
      },
      select: {
        company: { select: { name: true, contactEmail: true } },
      },
    })
    const alreadyContactedEmails = new Set(
      previouslySent
        .map((e) => e.company.contactEmail?.toLowerCase())
        .filter(Boolean) as string[]
    )
    const alreadyContactedNames = new Set(
      previouslySent.map((e) => e.company.name.toLowerCase())
    )

    const taggedCompanies = companies.map((c) => {
      const emailMatch = c.contactEmail && alreadyContactedEmails.has(c.contactEmail.toLowerCase())
      const nameMatch = alreadyContactedNames.has(c.name.toLowerCase())
      // Fill in estimated salary if API didn't provide one
      const salaryRange = c.salaryRange || estimateSalary(jobTitle, region)
      return { ...c, alreadyContacted: emailMatch || nameMatch, salaryRange }
    })

    // Only save companies that haven't already been contacted
    const toSave = taggedCompanies.filter((c) => !c.alreadyContacted)

    // Batch geocode unique location strings so we can persist lat/lng on each Company
    // Prefer the company's own location; fall back to the request's region
    const locationQueries = toSave.map((c) => c.location ?? region).filter(Boolean) as string[]
    const geoMap = locationQueries.length > 0 ? await geocodeForwardBatch(locationQueries) : new Map()

    function lookupGeo(raw: string | null | undefined) {
      if (!raw) return null
      const key = raw.toLowerCase().trim().replace(/\s+/g, ' ')
      return geoMap.get(key) ?? null
    }

    if (saveResults && toSave.length > 0) {
      await prisma.company.createMany({
        data: toSave.map((c) => {
          const geo = lookupGeo(c.location) ?? lookupGeo(region)
          return {
            campaignId,
            name: c.name,
            domain: c.domain || undefined,
            industry: c.industry || undefined,
            size: c.size || undefined,
            description: `${c.description}\n\nMatch reason: ${c.matchReason}`,
            contactEmail: c.contactEmail || undefined,
            contactName: c.contactName || undefined,
            linkedIn: c.linkedIn || undefined,
            latitude: geo?.lat ?? null,
            longitude: geo?.lng ?? null,
            region: geo?.shortName ?? null,
            status: 'PENDING' as const,
          }
        }),
        skipDuplicates: true,
      })
      invalidateAppliedCache(session.user.id)
    }

    // Feed the opportunity cache with all discovered locations (not just saved ones)
    const allLocations: Array<{ lat: number; lng: number; region: string }> = []
    for (const c of taggedCompanies) {
      const geo = lookupGeo(c.location) ?? lookupGeo(region)
      if (geo) allLocations.push({ lat: geo.lat, lng: geo.lng, region: geo.shortName })
    }
    if (allLocations.length > 0) addOpportunityLocations(session.user.id, allLocations)

    return NextResponse.json({ companies: taggedCompanies, saved: saveResults ? toSave.length : 0 })
  } catch (err) {
    console.error('Discover error:', err)
    const message = err instanceof Error ? err.message : 'Discovery failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
