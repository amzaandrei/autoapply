import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { invalidateAppliedCache } from './regions'
import { findOwnedCampaign, findOwnedCompany } from '../utils'

const companyCoreFields = z.object({
  domain: z.string().optional(),
  industry: z.string().optional(),
  size: z.string().optional(),
  description: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactName: z.string().optional(),
  linkedIn: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  region: z.string().optional(),
})

export const companiesRouter = router({
  list: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .query(async ({ ctx, input }) => {
      await findOwnedCampaign(input.campaignId, ctx.session.user.id)
      return prisma.company.findMany({
        where: { campaignId: input.campaignId },
        include: { _count: { select: { emails: true } } },
        orderBy: { createdAt: 'desc' },
      })
    }),

  create: protectedProcedure
    .input(companyCoreFields.extend({
      campaignId: z.string(),
      name: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      await findOwnedCampaign(input.campaignId, ctx.session.user.id)
      const result = await prisma.company.create({ data: input })
      invalidateAppliedCache(ctx.session.user.id)
      return result
    }),

  update: protectedProcedure
    .input(companyCoreFields.extend({
      id: z.string(),
      name: z.string().optional(),
      status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EMAILED', 'REPLIED', 'ARCHIVED']).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      await findOwnedCompany(id, ctx.session.user.id)
      const result = await prisma.company.update({ where: { id }, data })
      invalidateAppliedCache(ctx.session.user.id)
      return result
    }),

  bulkCreate: protectedProcedure
    .input(z.object({
      campaignId: z.string(),
      companies: z.array(companyCoreFields.extend({ name: z.string() })),
    }))
    .mutation(async ({ ctx, input }) => {
      await findOwnedCampaign(input.campaignId, ctx.session.user.id)
      const result = await prisma.company.createMany({
        data: input.companies.map(c => ({ ...c, campaignId: input.campaignId })),
      })
      invalidateAppliedCache(ctx.session.user.id)
      return result
    }),

  checkDuplicates: protectedProcedure
    .input(z.object({ names: z.array(z.string()) }))
    .query(async ({ ctx, input }) => {
      const existing = await prisma.company.findMany({
        where: {
          campaign: { userId: ctx.session.user.id },
          name: { in: input.names, mode: 'insensitive' },
        },
        select: { name: true, campaign: { select: { name: true } } },
      })
      return existing.map((c) => ({ name: c.name, campaignName: c.campaign.name }))
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await findOwnedCompany(input.id, ctx.session.user.id)
      const result = await prisma.company.delete({ where: { id: input.id } })
      invalidateAppliedCache(ctx.session.user.id)
      return result
    }),
})
