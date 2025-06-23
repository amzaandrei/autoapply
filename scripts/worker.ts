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
import { QUEUE_NAMES, enqueueFollowUpsForAllUsers, type ProcessFollowUpsJob } from '../lib/queue'
import { generateFollowUp } from '../lib/ai'
import { sendGmailEmail, refreshAccessToken } from '../lib/gmail'
import { getTier, limitsFor, incrementUsage } from '../lib/entitlements'
import { logger } from '../lib/logger'

async function processFollowUpsForUser(userId: string): Promise<{ sent: number; failed: number }> {
  const tier = await getTier(userId)
  if (!limitsFor(tier).followupsEnabled) {
    logger.info({ userId, tier }, 'worker: skipping follow-ups (not Pro)')
    return { sent: 0, failed: 0 }
  }

  const gmailToken = await prisma.gmailToken.findUnique({ where: { userId } })
  if (!gmailToken) return { sent: 0, failed: 0 }

  let accessToken = gmailToken.accessToken
  const isExpired =
    gmailToken.expiresAt && new Date() > new Date(gmailToken.expiresAt.getTime() - 60_000)
  if (isExpired && gmailToken.refreshToken) {
    const refreshed = await refreshAccessToken(gmailToken.refreshToken)
    accessToken = refreshed.accessToken
    await prisma.gmailToken.update({
      where: { userId },
      data: {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken ?? gmailToken.refreshToken,
        expiresAt: refreshed.expiresAt,
      },
    })
  }

  const [user, userProfile] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    }),
    prisma.userProfile.findUnique({ where: { userId } }),
  ])
  const fromHeader = user?.name ? `${user.name} <${user.email}>` : user?.email ?? ''
  const cvText = userProfile?.cvText ?? ''

  const campaigns = await prisma.campaign.findMany({
    where: { userId, followUpEnabled: true, status: 'ACTIVE' },
  })

  let sent = 0
  let failed = 0

  for (const campaign of campaigns) {
    const now = new Date()
    const delayMs = campaign.followUpDelayDays * 24 * 60 * 60 * 1000

    const emails = await prisma.generatedEmail.findMany({
      where: {
        campaignId: campaign.id,
        status: { in: ['SENT', 'OPENED'] },
        repliedAt: null,
        gmailThreadId: { not: null },
        sentAt: { not: null },
      },
      include: {
        company: true,
        followUps: { where: { status: 'SENT' }, orderBy: { sequence: 'desc' } },
      },
    })

    for (const email of emails) {
      const sentFollowUps = email.followUps.length
      if (sentFollowUps >= campaign.maxFollowUps) continue

      const lastSentAt = email.followUps[0]?.sentAt ?? email.sentAt
      if (!lastSentAt || now.getTime() - lastSentAt.getTime() < delayMs) continue

      const sequence = sentFollowUps + 1

      try {
        if (!email.company.contactEmail) continue

        const generated = await generateFollowUp({
          originalSubject: email.subject,
          originalBody: email.body,
          companyName: email.company.name,
          sequence,
          cvText,
          jobTitle: campaign.jobTitle ?? '',
        })

        const { messageId: gmailMessageId } = await sendGmailEmail({
          from: fromHeader,
          to: email.company.contactEmail,
          subject: generated.subject,
          body: generated.body,
          accessToken,
          emailId: email.id,
          threadId: email.gmailThreadId ?? undefined,
        })

        await prisma.followUp.create({
          data: {
            emailId: email.id,
            sequence,
            scheduledAt: new Date(),
            subject: generated.subject,
            body: generated.body,
            status: 'SENT',
            sentAt: new Date(),
            gmailMessageId,
          },
        })

        await incrementUsage(userId, 'follow_up', 1)
        sent += 1
      } catch (err) {
        logger.error({ err, emailId: email.id }, 'worker: follow-up failed')
        failed += 1
      }
    }
  }

  return { sent, failed }
}

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

function start() {
  if (!redis) {
    logger.error('REDIS_URL not set — worker cannot start')
    process.exit(1)
  }

  const worker = new Worker(
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

  worker.on('completed', (job) => logger.info({ id: job.id, name: job.name }, 'job completed'))
  worker.on('failed', (job, err) =>
    logger.error({ id: job?.id, name: job?.name, err }, 'job failed'),
  )

  if (process.env.WORKER_CRON_ENABLED === 'true' || process.env.WORKER_CRON_ENABLED === '1') {
    // Every 15 minutes
    cron.schedule('*/15 * * * *', async () => {
      try {
        await enqueueFollowUpsForAllUsers()
      } catch (err) {
        logger.error({ err }, 'cron schedule failed')
      }
    })
    logger.info('cron scheduled every 15 min')
  }

  logger.info('worker started')

  const shutdown = async () => {
    logger.info('shutting down worker')
    await worker.close()
    await prisma.$disconnect().catch(() => {})
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

start()
