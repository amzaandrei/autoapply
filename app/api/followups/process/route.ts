import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { processFollowUpsForUser } from '@/lib/followup-runner'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await processFollowUpsForUser(session.user.id)

    if (summary.skipped === 'not_pro') {
      return NextResponse.json(
        {
          error: 'Follow-ups are a Pro feature. Upgrade to enable auto follow-ups.',
          upgrade: true,
        },
        { status: 402 },
      )
    }
    if (summary.skipped === 'no_gmail') {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 })
    }

    return NextResponse.json({
      processed: summary.processed,
      sent: summary.sent,
      failed: summary.failed,
      results: summary.results,
    })
  } catch (err) {
    console.error('Follow-up process error:', err)
    const message = err instanceof Error ? err.message : 'Failed to process follow-ups'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
