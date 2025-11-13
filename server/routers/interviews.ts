import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { findOwnedCampaign, findOwnedCompany } from '../utils'

const STAGES = ['APPLIED', 'PHONE_SCREEN', 'TECHNICAL', 'ONSITE', 'OFFER', 'REJECTED', 'ACCEPTED'] as const

export const interviewsRouter = router({
  listByCampaign: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .query(async ({ ctx, input }) => {
      await findOwnedCampaign(input.campaignId, ctx.session.user.id)

      const companies = await prisma.company.findMany({
        where: { campaignId: input.campaignId, status: { in: ['EMAILED', 'REPLIED'] } },
        include: {
          interviewStages: { orderBy: { createdAt: 'desc' }, take: 1 },
          emails: { where: { status: 'REPLIED' }, select: { repliedAt: true }, take: 1 },
        },
      })

      return companies.map((c) => ({
        id: c.id,
        name: c.name,
        contactEmail: c.contactEmail,
        currentStage: c.interviewStages[0]?.stage ?? 'APPLIED',
        scheduledAt: c.interviewStages[0]?.scheduledAt,
        notes: c.interviewStages[0]?.notes,
        repliedAt: c.emails[0]?.repliedAt,
      }))
    }),

  updateStage: protectedProcedure
    .input(z.object({
      companyId: z.string(),
      stage: z.enum(STAGES),
      scheduledAt: z.string().datetime().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await findOwnedCompany(input.companyId, ctx.session.user.id)
      return prisma.interviewStage.create({
        data: {
          companyId: input.companyId,
          stage: input.stage,
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
          notes: input.notes,
        },
      })
    }),

  history: protectedProcedure
    .input(z.object({ companyId: z.string() }))
    .query(async ({ ctx, input }) => {
      await findOwnedCompany(input.companyId, ctx.session.user.id)
      return prisma.interviewStage.findMany({
        where: { companyId: input.companyId },
        orderBy: { createdAt: 'asc' },
      })
    }),
})
