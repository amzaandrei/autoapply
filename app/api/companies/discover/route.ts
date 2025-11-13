import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { discoverCompanies, type CompanyResult } from '@/lib/ai'
import { searchAllJobAPIs } from '@/lib/job-apis'
import { findAndVerifyForDiscovery } from '@/lib/contact-resolver'
import { hunterEnrichCompany, type HunterCompanyEnrichment } from '@/lib/hunter'
import { estimateSalary } from '@/lib/salary-estimator'
import { rateLimit } from '@/lib/rate-limit'
import { geocodeForwardBatch } from '@/lib/geocode-cache'
import { addOpportunityLocations, invalidateAppliedCache } from '@/server/routers/regions'
import { checkQuota, incrementUsage, getTier } from '@/lib/entitlements'
import { hasTierAtLeast } from '@/lib/tier-limits'
import { track } from '@/lib/analytics'
import { withAuth } from '@/lib/api-auth'

export const POST = withAuth(async (request, { userId }) => {
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
    const limit = rateLimit(`discover:${userId}`, 30, 60 * 60 * 1000)
    if (!limit.allowed) {
      return NextResponse.json({
        error: `Too many searches. Try again in ${Math.ceil(limit.resetIn / 60)} minutes.`,
      }, { status: 429 })
    }

    // Plan quota — hourly discovery rate
    const quota = await checkQuota(userId, 'discovery')
    if (!quota.allowed) {
      return NextResponse.json({
        error: `Hourly discovery limit reached (${quota.limit}/hr on ${quota.tier}).`,
        upgrade: quota.tier === 'FREE',
        tier: quota.tier,
      }, { status: 402 })
    }

    // Hunter monthly cap — protects the Hunter bill from runaway users.
    // Every company discovered burns up to 2 Hunter credits (1 search + 1 verify),
    // so refuse the whole search if we're near the cap rather than burn credits
    // for a half-completed result.
    const hunterQuota = await checkQuota(userId, 'hunter_request')
    if (!hunterQuota.allowed) {
      return NextResponse.json({
        error: `Monthly email-verification limit reached (${hunterQuota.limit}/month on ${hunterQuota.tier}). Upgrade to Pro for a higher cap.`,
        upgrade: hunterQuota.tier === 'FREE',
        tier: hunterQuota.tier,
        remaining: hunterQuota.remaining,
      }, { status: 402 })
    }

    await incrementUsage(userId, 'discovery')

    // Verify campaign
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, userId: userId },
    })
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    let companies: CompanyResult[] = []

    if (source === 'ai') {
      companies = await discoverCompanies({ jobTitle, industry, region, additionalContext, searchMode, userId: userId })
    } else if (source === 'jobs') {
      companies = await searchAllJobAPIs(jobTitle, region, searchMode)
    } else {
      // 'both' — fetch in parallel, merge, dedup by company name
      const [aiResults, jobResults] = await Promise.all([
        discoverCompanies({ jobTitle, industry, region, additionalContext, searchMode, userId: userId }),
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
      where: { userId: userId },
      select: { name: true, domain: true },
    })
    const blacklistNames = new Set(blacklist.map((b) => b.name.toLowerCase()))
    const blacklistDomains = new Set(blacklist.map((b) => b.domain?.toLowerCase()).filter(Boolean) as string[])
    companies = companies.filter((c) => {
      if (blacklistNames.has(c.name.toLowerCase())) return false
      if (c.domain && blacklistDomains.has(c.domain.toLowerCase())) return false
      return true
    })

    // Verified-only gate: every company shown to the user must have a
    // Hunter-verified hiring email. For companies without an email, Hunter
    // attempts to find one from the company name/domain. Anything Hunter
    // can't produce *and* verify is dropped — the user only sees companies
    // they can actually email. Sequential because Hunter rate-limits.
    const beforeVerify = companies.length
    const verifiedCompanies: CompanyResult[] = []
    // Stop verifying if we'd blow past the per-user Hunter cap mid-loop.
    // Each iteration can burn up to 2 Hunter credits (search + verify).
    let hunterCreditsRemaining = hunterQuota.remaining
    for (const c of companies) {
      if (hunterCreditsRemaining <= 0) break
      const verified = await findAndVerifyForDiscovery({
        companyName: c.name,
        domain: c.domain,
        existingEmail: c.contactEmail,
        contactName: c.contactName,
        userId: userId,
      })
      // Worst case: 1 domain search (if email missing) + 1 verify
      hunterCreditsRemaining -= 2
      if (!verified) continue
      verifiedCompanies.push({
        ...c,
        contactEmail: verified.email,
        domain: c.domain || verified.resolvedDomain || '',
      })
    }
    const droppedUnverified = beforeVerify - verifiedCompanies.length
    companies = verifiedCompanies

    // Hunter Company Enrichment — paid tiers only. Runs against a SEPARATE
    // Hunter quota (enrichment credits), so we check it independently.
    // Enriched firmographics (year founded, country, tech stack, logo)
    // dramatically sharpen the personalization in `generateEmail`.
    const enrichmentByDomain = new Map<string, HunterCompanyEnrichment>()
    const tier = await getTier(userId)
    if (hasTierAtLeast(tier, 'STARTER') && companies.length > 0) {
      const enrichQuota = await checkQuota(userId, 'hunter_enrichment')
      let enrichRemaining = enrichQuota.allowed ? enrichQuota.remaining : 0
      for (const c of companies) {
        if (enrichRemaining <= 0) break
        const domain = c.domain
        if (!domain) continue
        if (enrichmentByDomain.has(domain)) continue
        const enrichment = await hunterEnrichCompany({ domain, userId: userId })
        enrichRemaining -= 1
        if (enrichment) enrichmentByDomain.set(domain, enrichment)
      }
    }

    // Tag companies that were already contacted across any campaign
    const previouslySent = await prisma.generatedEmail.findMany({
      where: {
        campaign: { userId: userId },
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
          const enrich = c.domain ? enrichmentByDomain.get(c.domain) : undefined
          return {
            campaignId,
            name: c.name,
            domain: c.domain || undefined,
            // Prefer Hunter's authoritative firmographics when present; fall
            // back to the AI-guessed values.
            industry: enrich?.industry ?? c.industry ?? undefined,
            size: enrich?.employeeCount ?? c.size ?? undefined,
            description: `${c.description}\n\nMatch reason: ${c.matchReason}`,
            contactEmail: c.contactEmail || undefined,
            contactName: c.contactName || undefined,
            linkedIn: enrich?.linkedIn ?? c.linkedIn ?? undefined,
            latitude: geo?.lat ?? null,
            longitude: geo?.lng ?? null,
            region: geo?.shortName ?? null,
            yearFounded: enrich?.foundedYear ?? undefined,
            country: enrich?.country ?? undefined,
            locality: enrich?.locality ?? undefined,
            logo: enrich?.logo ?? undefined,
            techStack: enrich?.techStack ?? [],
            enrichedAt: enrich ? new Date() : undefined,
            status: 'PENDING' as const,
          }
        }),
        skipDuplicates: true,
      })
      invalidateAppliedCache(userId)
    }

    // Feed the opportunity cache with all discovered locations (not just saved ones)
    const allLocations: Array<{ lat: number; lng: number; region: string }> = []
    for (const c of taggedCompanies) {
      const geo = lookupGeo(c.location) ?? lookupGeo(region)
      if (geo) allLocations.push({ lat: geo.lat, lng: geo.lng, region: geo.shortName })
    }
    if (allLocations.length > 0) addOpportunityLocations(userId, allLocations)

    track(userId, 'companies_discovered', {
      count: taggedCompanies.length,
      saved: saveResults ? toSave.length : 0,
      droppedUnverified,
      source,
    })
    return NextResponse.json({
      companies: taggedCompanies,
      saved: saveResults ? toSave.length : 0,
      droppedUnverified,
    })
  } catch (err) {
    console.error('Discover error:', err)
    const message = err instanceof Error ? err.message : 'Discovery failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
})
