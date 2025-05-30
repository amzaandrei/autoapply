// One-time backfill: geocode existing Company rows that don't have lat/lng yet.
// Uses Claude AI to extract a likely location from the company's description/name/domain,
// then Mapbox to convert that to coordinates.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { geocodeForwardBatch } from '@/lib/geocode-cache'
import { invalidateAppliedCache } from '@/server/routers/regions'
import Anthropic from '@anthropic-ai/sdk'

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Extract the primary HQ location from a batch of companies in one AI call.
// Returns a map of name → location string (or null).
async function extractLocationsBatch(
  companies: Array<{ name: string; domain: string | null; description: string | null }>
): Promise<Map<string, string | null>> {
  if (companies.length === 0) return new Map()

  const prompt = `For each company below, return its primary HQ / headquarters city and country. Return ONLY valid JSON, no markdown.

Companies:
${companies.map((c, i) => `${i + 1}. ${c.name}${c.domain ? ` (${c.domain})` : ''}${c.description ? ` — ${c.description.slice(0, 200)}` : ''}`).join('\n')}

Return JSON array with one object per company in the same order:
[{"name":"CompanyName","location":"City, Country" or null if unknown}]`

  try {
    const response = await ai.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: 'Return only valid JSON. No prose.',
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content.find((b) => b.type === 'text')
    if (!text || text.type !== 'text') return new Map()

    const raw = text.text.trim()
    const jsonStr = raw.startsWith('[') ? raw : raw.match(/\[[\s\S]*\]/)?.[0] ?? raw
    const parsed = JSON.parse(jsonStr) as Array<{ name: string; location: string | null }>

    const map = new Map<string, string | null>()
    for (const entry of parsed) {
      if (entry?.name) map.set(entry.name.toLowerCase(), entry.location)
    }
    return map
  } catch (err) {
    console.error('AI location extraction failed:', err)
    return new Map()
  }
}

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Find all user's companies without coordinates
    const companies = await prisma.company.findMany({
      where: {
        campaign: { userId: session.user.id },
        latitude: null,
      },
      select: { id: true, name: true, domain: true, description: true },
    })

    if (companies.length === 0) {
      return NextResponse.json({ processed: 0, geocoded: 0, message: 'All companies already have coordinates.' })
    }

    // Batch in groups of 15 to keep AI prompt size sensible
    const batchSize = 15
    const locationMap = new Map<string, string | null>()
    for (let i = 0; i < companies.length; i += batchSize) {
      const batch = companies.slice(i, i + batchSize)
      const batchMap = await extractLocationsBatch(batch)
      for (const [k, v] of batchMap.entries()) locationMap.set(k, v)
    }

    // Collect unique location strings and geocode in batch
    const uniqueLocations = [...new Set([...locationMap.values()].filter(Boolean) as string[])]
    const geoResults = await geocodeForwardBatch(uniqueLocations)

    function lookupGeo(loc: string | null) {
      if (!loc) return null
      return geoResults.get(loc.toLowerCase().trim().replace(/\s+/g, ' ')) ?? null
    }

    // Update each company
    let geocodedCount = 0
    for (const c of companies) {
      const loc = locationMap.get(c.name.toLowerCase())
      const geo = loc ? lookupGeo(loc) : null
      if (geo) {
        await prisma.company.update({
          where: { id: c.id },
          data: {
            latitude: geo.lat,
            longitude: geo.lng,
            region: geo.shortName,
          },
        })
        geocodedCount++
      }
    }

    invalidateAppliedCache(session.user.id)

    return NextResponse.json({
      processed: companies.length,
      geocoded: geocodedCount,
      skipped: companies.length - geocodedCount,
    })
  } catch (err) {
    console.error('Backfill error:', err)
    const message = err instanceof Error ? err.message : 'Backfill failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
