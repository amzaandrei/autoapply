/**
 * BullMQ queue for background jobs. No-ops if REDIS_URL is not set so the app
 * still runs in dev without Redis (follow-ups just don't auto-process).
 */
import { Queue, type JobsOptions } from 'bullmq'
import { redis } from './redis'

export const QUEUE_NAMES = {
  FOLLOW_UPS: 'follow-ups',
} as const

let _followUpsQueue: Queue | null = null

export function getFollowUpsQueue(): Queue | null {
  if (!redis) return null
  if (_followUpsQueue) return _followUpsQueue
  _followUpsQueue = new Queue(QUEUE_NAMES.FOLLOW_UPS, { connection: redis })
  return _followUpsQueue
}

export interface ProcessFollowUpsJob {
  userId: string
  campaignId?: string
}

export async function enqueueFollowUpsForUser(userId: string): Promise<boolean> {
  const q = getFollowUpsQueue()
  if (!q) return false
  const opts: JobsOptions = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  }
  await q.add('process', { userId } satisfies ProcessFollowUpsJob, opts)
  return true
}

export async function enqueueFollowUpsForAllUsers(): Promise<boolean> {
  const q = getFollowUpsQueue()
  if (!q) return false
  const opts: JobsOptions = {
    jobId: `scheduled-${Date.now()}`,
    attempts: 1,
    removeOnComplete: { count: 10 },
  }
  await q.add('scheduled-sweep', {} as ProcessFollowUpsJob, opts)
  return true
}
