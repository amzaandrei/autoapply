import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { TRPCError } from '@trpc/server'

export const companiesRouter = router({
  list: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .query(async ({ ctx, input }) => {
      const campaign = await prisma.campaign.findFirst({
        where: { id: input.campaignId, userId: ctx.session.user.id },
      })
      if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' })

      return prisma.company.findMany({
        where: { campaignId: input.campaignId },
        include: { _count: { select: { emails: true } } },
        orderBy: { createdAt: 'desc' },
      })
    }),

  create: protectedProcedure
    .input(z.object({
      campaignId: z.string(),
      name: z.string().min(1),
      domain: z.string().optional(),
      industry: z.string().optional(),
      size: z.string().optional(),
      description: z.string().optional(),
      contactEmail: z.string().email().optional(),
      contactName: z.string().optional(),
      linkedIn: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const campaign = await prisma.campaign.findFirst({
        where: { id: input.campaignId, userId: ctx.session.user.id },
      })
      if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' })
      return prisma.company.create({ data: input })
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().optional(),
      domain: z.string().optional(),
      industry: z.string().optional(),
      size: z.string().optional(),
      description: z.string().optional(),
      contactEmail: z.string().email().optional(),
      contactName: z.string().optional(),
      linkedIn: z.string().optional(),
      status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EMAILED', 'REPLIED', 'ARCHIVED']).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      return prisma.company.update({ where: { id }, data })
    }),

  bulkCreate: protectedProcedure
    .input(z.object({
      campaignId: z.string(),
      companies: z.array(z.object({
        name: z.string(),
        domain: z.string().optional(),
        industry: z.string().optional(),
        contactEmail: z.string().email().optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const campaign = await prisma.campaign.findFirst({
        where: { id: input.campaignId, userId: ctx.session.user.id },
      })
      if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' })
      return prisma.company.createMany({
        data: input.companies.map(c => ({ ...c, campaignId: input.campaignId })),
      })
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      return prisma.company.delete({ where: { id: input.id } })
    }),
})
