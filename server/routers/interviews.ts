import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { TRPCError } from '@trpc/server'

const STAGES = ['APPLIED', 'PHONE_SCREEN', 'TECHNICAL', 'ONSITE', 'OFFER', 'REJECTED', 'ACCEPTED'] as const

export const interviewsRouter = router({
  listByCampaign: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .query(async ({ ctx, input }) => {
      const campaign = await prisma.campaign.findFirst({
        where: { id: input.campaignId, userId: ctx.session.user.id },
      })
      if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' })

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
      const company = await prisma.company.findUnique({
        where: { id: input.companyId },
        include: { campaign: { select: { userId: true } } },
      })
      if (!company || company.campaign.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'NOT_FOUND' })
      }
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
      const company = await prisma.company.findUnique({
        where: { id: input.companyId },
        include: { campaign: { select: { userId: true } } },
      })
      if (!company || company.campaign.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'NOT_FOUND' })
      }
      return prisma.interviewStage.findMany({
        where: { companyId: input.companyId },
        orderBy: { createdAt: 'asc' },
      })
    }),
})
