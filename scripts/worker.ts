/**
 * Background worker. Run as a separate Node process (see docker-compose `worker` service).
 *
 * - BullMQ Worker processes `follow-ups` queue
 * - node-cron enqueues a scheduled sweep every 15 minutes (opt-in via WORKER_CRON_ENABLED)
 *
 * Build: pnpm exec tsc --module commonjs --target es2020 --outDir dist scripts/worker.ts
 * Run:   node dist/worker.js
 */
import 'dotenv/config'
import { Worker, type Job } from 'bullmq'
import cron from 'node-cron'
import { redis } from '../lib/redis'
import { prisma } from '../lib/prisma'
import {
  QUEUE_NAMES,
  enqueueFollowUpsForAllUsers,
  enqueueAutopilotForTemplate,
  enqueueAutopilotSweep,
  type ProcessFollowUpsJob,
  type ProcessAutopilotJob,
} from '../lib/queue'
import { processFollowUpsForUser } from '../lib/followup-runner'
import { runAutopilotForTemplate } from '../lib/autopilot'
import { logger } from '../lib/logger'

async function processAllUsers(): Promise<void> {
  const users = await prisma.user.findMany({
    where: {
      campaigns: { some: { followUpEnabled: true, status: 'ACTIVE' } },
      subscription: { tier: 'PRO', status: { in: ['ACTIVE', 'TRIALING'] } },
    },
    select: { id: true },
  })
  for (const u of users) {
    try {
      await processFollowUpsForUser(u.id)
    } catch (err) {
      logger.error({ err, userId: u.id }, 'worker: user sweep failed')
    }
  }
}

/**
 * Autopilot sweep — enqueues one autopilot job per template that's due to run.
 * Templates are "due" when autopilotEnabled=true, consent accepted, and
 * autopilotNextRunAt is in the past (or unset).
 */
async function processAutopilotSweep(): Promise<void> {
  const now = new Date()
  const templates = await prisma.campaignTemplate.findMany({
    where: {
      autopilotEnabled: true,
      autopilotAcceptedAt: { not: null },
      OR: [{ autopilotNextRunAt: null }, { autopilotNextRunAt: { lte: now } }],
      user: { subscription: { tier: 'PRO', status: { in: ['ACTIVE', 'TRIALING'] } } },
    },
    select: { id: true },
  })
  logger.info({ count: templates.length }, 'autopilot sweep: enqueueing')
  for (const t of templates) {
    try {
      await enqueueAutopilotForTemplate(t.id)
    } catch (err) {
      logger.error({ err, templateId: t.id }, 'autopilot sweep: enqueue failed')
    }
  }
}

function start() {
  if (!redis) {
    logger.error('REDIS_URL not set — worker cannot start')
    process.exit(1)
  }

  const followUpsWorker = new Worker(
    QUEUE_NAMES.FOLLOW_UPS,
    async (job: Job<ProcessFollowUpsJob>) => {
      if (job.name === 'scheduled-sweep') {
        await processAllUsers()
        return
      }
      if (job.data.userId) {
        await processFollowUpsForUser(job.data.userId)
      }
    },
    { connection: redis, concurrency: 2 },
  )

  const autopilotWorker = new Worker(
    QUEUE_NAMES.AUTOPILOT,
    async (job: Job<ProcessAutopilotJob>) => {
      if (job.name === 'scheduled-sweep') {
        await processAutopilotSweep()
        return
      }
      if (job.data.templateId) {
        const result = await runAutopilotForTemplate(job.data.templateId)
        logger.info({ templateId: job.data.templateId, ...result }, 'autopilot job finished')
      }
    },
    { connection: redis, concurrency: 1 },
  )

  for (const w of [followUpsWorker, autopilotWorker]) {
    w.on('completed', (job) => logger.info({ id: job.id, name: job.name }, 'job completed'))
    w.on('failed', (job, err) =>
      logger.error({ id: job?.id, name: job?.name, err }, 'job failed'),
    )
  }

  if (process.env.WORKER_CRON_ENABLED === 'true' || process.env.WORKER_CRON_ENABLED === '1') {
    // Follow-ups sweep — every 15 minutes
    cron.schedule('*/15 * * * *', async () => {
      try {
        await enqueueFollowUpsForAllUsers()
      } catch (err) {
        logger.error({ err }, 'cron: follow-ups sweep failed')
      }
    })
    logger.info('cron: follow-ups sweep scheduled every 15 min')

    // Autopilot sweep — every hour on the hour (templates run daily/weekly,
    // so hourly checks are plenty)
    if (process.env.AUTOPILOT_ENABLED === 'true' || process.env.AUTOPILOT_ENABLED === '1') {
      cron.schedule('0 * * * *', async () => {
        try {
          await enqueueAutopilotSweep()
        } catch (err) {
          logger.error({ err }, 'cron: autopilot sweep failed')
        }
      })
      logger.info('cron: autopilot sweep scheduled every hour')
    }
  }

  logger.info('worker started')

  const shutdown = async () => {
    logger.info('shutting down worker')
    await followUpsWorker.close()
    await autopilotWorker.close()
    await prisma.$disconnect().catch(() => {})
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

start()
