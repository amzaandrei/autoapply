import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { TRPCError } from '@trpc/server'
import { getTier, limitsFor } from '@/lib/entitlements'
import { track } from '@/lib/analytics'
import { findOwnedCampaign } from '../utils'

const campaignBaseFields = z.object({
  description: z.string().optional(),
  jobTitle: z.string().optional(),
  industry: z.string().optional(),
  region: z.string().optional(),
  useEmailTemplate: z.boolean().optional(),
  followUpEnabled: z.boolean().optional(),
  followUpDelayDays: z.number().int().min(1).max(30).optional(),
  maxFollowUps: z.number().int().min(1).max(3).optional(),
  abTestEnabled: z.boolean().optional(),
  abToneA: z.enum(['concise', 'balanced', 'detailed']).optional(),
  abToneB: z.enum(['concise', 'balanced', 'detailed']).optional(),
  attachCv: z.boolean().optional(),
})

export const campaignsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return prisma.campaign.findMany({
      where: { userId: ctx.session.user.id },
      include: {
        _count: { select: { companies: true, emails: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const campaign = await prisma.campaign.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
        include: {
          companies: { include: { emails: true } },
          emails: true,
        },
      })
      if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' })
      return campaign
    }),

  create: protectedProcedure
    .input(campaignBaseFields.extend({
      name: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const [tier, count] = await Promise.all([
        getTier(userId),
        prisma.campaign.count({ where: { userId } }),
      ])
      const limit = limitsFor(tier).maxCampaigns
      if (count >= limit) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Free tier is limited to ${limit} campaigns. Upgrade to Pro for unlimited campaigns.`,
        })
      }
      const created = await prisma.campaign.create({
        data: { ...input, userId },
      })
      track(userId, 'campaign_created', { campaignId: created.id, tier })
      return created
    }),

  update: protectedProcedure
    .input(campaignBaseFields.extend({
      id: z.string(),
      name: z.string().min(1).optional(),
      status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      await findOwnedCampaign(id, ctx.session.user.id)
      return prisma.campaign.update({ where: { id }, data })
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await findOwnedCampaign(input.id, ctx.session.user.id)
      return prisma.campaign.delete({ where: { id: input.id } })
    }),
})
