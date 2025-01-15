import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { TRPCError } from '@trpc/server'

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
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      jobTitle: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return prisma.campaign.create({
        data: { ...input, userId: ctx.session.user.id },
      })
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      jobTitle: z.string().optional(),
      status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      const existing = await prisma.campaign.findFirst({
        where: { id, userId: ctx.session.user.id },
      })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      return prisma.campaign.update({ where: { id }, data })
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.campaign.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
      })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      return prisma.campaign.delete({ where: { id: input.id } })
    }),
})
