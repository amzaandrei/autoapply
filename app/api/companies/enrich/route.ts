import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { enrichCompany } from '@/lib/ai'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { name, domain, industry } = await request.json() as { name: string; domain?: string; industry?: string }
    if (!name) return NextResponse.json({ error: 'Company name required' }, { status: 400 })

    // Rate limit: max 30 enrichment calls per hour
    const limit = rateLimit(`enrich:${session.user.id}`, 30, 60 * 60 * 1000)
    if (!limit.allowed) {
      return NextResponse.json({
        error: `Too many enrichment requests. Try again in ${Math.ceil(limit.resetIn / 60)} minutes.`,
      }, { status: 429 })
    }

    const enrichment = await enrichCompany({ name, domain, industry, userId: session.user.id })
    return NextResponse.json(enrichment)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
