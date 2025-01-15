import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { TRPCError } from '@trpc/server'

export const emailsRouter = router({
  list: protectedProcedure
    .input(z.object({
      campaignId: z.string(),
      status: z.enum(['DRAFT', 'READY', 'SENT', 'OPENED', 'REPLIED', 'BOUNCED', 'ARCHIVED']).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const campaign = await prisma.campaign.findFirst({
        where: { id: input.campaignId, userId: ctx.session.user.id },
      })
      if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' })

      return prisma.generatedEmail.findMany({
        where: {
          campaignId: input.campaignId,
          ...(input.status ? { status: input.status } : {}),
        },
        include: { company: true },
        orderBy: { createdAt: 'desc' },
      })
    }),

  create: protectedProcedure
    .input(z.object({
      companyId: z.string(),
      campaignId: z.string(),
      subject: z.string().min(1),
      body: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      return prisma.generatedEmail.create({ data: input })
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      subject: z.string().optional(),
      body: z.string().optional(),
      status: z.enum(['DRAFT', 'READY', 'SENT', 'OPENED', 'REPLIED', 'BOUNCED', 'ARCHIVED']).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      return prisma.generatedEmail.update({ where: { id }, data })
    }),

  markSent: protectedProcedure
    .input(z.object({
      id: z.string(),
      gmailThreadId: z.string().optional(),
      gmailMessageId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      return prisma.generatedEmail.update({
        where: { id },
        data: { ...data, status: 'SENT', sentAt: new Date() },
      })
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return prisma.generatedEmail.delete({ where: { id: input.id } })
    }),
})
