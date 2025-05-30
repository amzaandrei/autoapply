// Heat map data + opportunity markers for the Coverage feature.
//
// Schema requirement (applied via psql — same pattern as other routers):
//   ALTER TABLE "Company"
//     ADD COLUMN "latitude" DOUBLE PRECISION,
//     ADD COLUMN "longitude" DOUBLE PRECISION,
//     ADD COLUMN "region" TEXT;
//   CREATE INDEX "Company_latitude_longitude_idx" ON "Company" ("latitude", "longitude")
//     WHERE "latitude" IS NOT NULL;

import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { TECH_HUBS, haversineKm } from '@/lib/tech-hubs'
import { geocodeForwardBatch } from '@/lib/geocode-cache'

// ── In-memory caches (per-process) ─────────────────────────────────────

interface AppliedHeatCacheEntry {
  data: AppliedHeatData
  expires: number
}
interface OpportunityCacheEntry {
  locations: Array<{ lat: number; lng: number; region: string; observedAt: number }>
  expires: number
}

const appliedCache = new Map<string, AppliedHeatCacheEntry>()
const opportunityCache = new Map<string, OpportunityCacheEntry>()

const APPLIED_TTL = 5 * 60 * 1000
const OPPORTUNITY_TTL = 2 * 60 * 60 * 1000

// Cleanup
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of appliedCache.entries()) if (v.expires < now) appliedCache.delete(k)
  for (const [k, v] of opportunityCache.entries()) if (v.expires < now) opportunityCache.delete(k)
}, 30 * 60 * 1000).unref?.()

export function invalidateAppliedCache(userId: string) {
  appliedCache.delete(userId)
}

export function addOpportunityLocations(userId: string, locations: Array<{ lat: number; lng: number; region: string }>) {
  const now = Date.now()
  const existing = opportunityCache.get(userId)?.locations ?? []
  // Keep most recent 200, avoid unbounded growth
  const merged = [...existing, ...locations.map((l) => ({ ...l, observedAt: now }))].slice(-200)
  opportunityCache.set(userId, { locations: merged, expires: now + OPPORTUNITY_TTL })
}

// ── Types ───────────────────────────────────────────────────────────────

export interface AppliedHeatData {
  points: Array<{ lat: number; lng: number; companyCount: number; appliedCount: number }>
  regions: Array<{ name: string; lat: number; lng: number; companyCount: number }>
  stats: { totalApplied: number; totalCompanies: number; uniqueRegions: number }
}

// ── Helpers ─────────────────────────────────────────────────────────────

async function loadAppliedHeatData(userId: string): Promise<AppliedHeatData> {
  const cached = appliedCache.get(userId)
  if (cached && cached.expires > Date.now()) return cached.data

  const companies = await prisma.company.findMany({
    where: {
      campaign: { userId },
      latitude: { not: null },
      longitude: { not: null },
      emails: { some: { status: { in: ['SENT', 'OPENED', 'REPLIED'] } } },
    },
    select: {
      latitude: true,
      longitude: true,
      region: true,
      name: true,
      _count: { select: { emails: { where: { status: { in: ['SENT', 'OPENED', 'REPLIED'] } } } } },
    },
  })

  // Cluster by rounded coords (~1km at 2 decimals, depending on latitude)
  const clusters = new Map<string, { lat: number; lng: number; companyCount: number; appliedCount: number }>()
  const regionMap = new Map<string, { name: string; lat: number; lng: number; companyCount: number }>()

  for (const c of companies) {
    if (c.latitude == null || c.longitude == null) continue
    const key = `${c.latitude.toFixed(2)},${c.longitude.toFixed(2)}`
    const emailCount = c._count.emails
    const existing = clusters.get(key)
    if (existing) {
      existing.companyCount += 1
      existing.appliedCount += emailCount
    } else {
      clusters.set(key, { lat: c.latitude, lng: c.longitude, companyCount: 1, appliedCount: emailCount })
    }

    if (c.region) {
      const r = regionMap.get(c.region)
      if (r) r.companyCount += 1
      else regionMap.set(c.region, { name: c.region, lat: c.latitude, lng: c.longitude, companyCount: 1 })
    }
  }

  const data: AppliedHeatData = {
    points: [...clusters.values()],
    regions: [...regionMap.values()].sort((a, b) => b.companyCount - a.companyCount),
    stats: {
      totalCompanies: companies.length,
      totalApplied: companies.reduce((sum, c) => sum + c._count.emails, 0),
      uniqueRegions: regionMap.size,
    },
  }

  appliedCache.set(userId, { data, expires: Date.now() + APPLIED_TTL })
  return data
}

// ── Router ──────────────────────────────────────────────────────────────

export const regionsRouter = router({
  getAppliedHeatData: protectedProcedure.query(async ({ ctx }) => {
    return loadAppliedHeatData(ctx.session.user.id)
  }),

  getOpportunities: protectedProcedure
    .input(z.object({ excludeNearKm: z.number().min(0).max(500).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const excludeNearKm = input?.excludeNearKm ?? 50
      const applied = await loadAppliedHeatData(ctx.session.user.id)
      const appliedPoints = applied.points

      // Build opportunities from static hubs not near applied points
      type Opp = {
        id: string
        name: string
        lat: number
        lng: number
        weight: number
        jobCount?: number
        tier: 1 | 2 | 3
        industries: string[]
        source: 'static' | 'jobs' | 'both'
      }

      const baseWeight: Record<1 | 2 | 3, number> = { 1: 6, 2: 4, 3: 2 }
      const opps: Opp[] = []

      for (const hub of TECH_HUBS) {
        const tooClose = appliedPoints.some((p) => haversineKm(hub.lat, hub.lng, p.lat, p.lng) < excludeNearKm)
        if (tooClose) continue
        opps.push({
          id: hub.id,
          name: hub.name,
          lat: hub.lat,
          lng: hub.lng,
          weight: baseWeight[hub.tier],
          tier: hub.tier,
          industries: [...hub.industries],
          source: 'static',
        })
      }

      // Merge in job-derived locations from the opportunity cache
      const cached = opportunityCache.get(ctx.session.user.id)
      if (cached && cached.expires > Date.now()) {
        // Group by ~25km radius to avoid duplicates
        const jobClusters = new Map<string, { lat: number; lng: number; region: string; count: number }>()
        for (const loc of cached.locations) {
          const key = `${loc.lat.toFixed(1)},${loc.lng.toFixed(1)}`
          const existing = jobClusters.get(key)
          if (existing) existing.count += 1
          else jobClusters.set(key, { lat: loc.lat, lng: loc.lng, region: loc.region, count: 1 })
        }

        for (const cluster of jobClusters.values()) {
          // Skip if near an applied point
          if (appliedPoints.some((p) => haversineKm(cluster.lat, cluster.lng, p.lat, p.lng) < excludeNearKm)) continue

          // If near an existing static hub, boost its weight + jobCount
          const matchIdx = opps.findIndex((o) => haversineKm(cluster.lat, cluster.lng, o.lat, o.lng) < 50)
          if (matchIdx >= 0) {
            opps[matchIdx].weight = Math.min(10, opps[matchIdx].weight + Math.min(cluster.count, 4))
            opps[matchIdx].jobCount = (opps[matchIdx].jobCount ?? 0) + cluster.count
            opps[matchIdx].source = 'both'
          } else {
            opps.push({
              id: `job-${cluster.lat.toFixed(1)}-${cluster.lng.toFixed(1)}`,
              name: cluster.region,
              lat: cluster.lat,
              lng: cluster.lng,
              weight: Math.min(10, 3 + cluster.count),
              tier: 3,
              industries: [],
              jobCount: cluster.count,
              source: 'jobs',
            })
          }
        }
      }

      return opps.sort((a, b) => b.weight - a.weight)
    }),

  trackDiscoveryLocations: protectedProcedure
    .input(z.object({ locations: z.array(z.object({ location: z.string().optional(), lat: z.number().optional(), lng: z.number().optional() })) }))
    .mutation(async ({ ctx, input }) => {
      const needsGeocoding: string[] = []
      const known: Array<{ lat: number; lng: number; region: string }> = []

      for (const loc of input.locations) {
        if (loc.lat != null && loc.lng != null) {
          known.push({ lat: loc.lat, lng: loc.lng, region: loc.location ?? '' })
        } else if (loc.location) {
          needsGeocoding.push(loc.location)
        }
      }

      if (needsGeocoding.length > 0) {
        const geoResults = await geocodeForwardBatch(needsGeocoding)
        for (const [, result] of geoResults.entries()) {
          if (result) known.push({ lat: result.lat, lng: result.lng, region: result.shortName })
        }
      }

      addOpportunityLocations(ctx.session.user.id, known)
      return { tracked: known.length }
    }),
})
