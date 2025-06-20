import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { TRPCError } from '@trpc/server'

export const followupsRouter = router({
  listByEmail: protectedProcedure
    .input(z.object({ emailId: z.string() }))
    .query(async ({ ctx, input }) => {
      const email = await prisma.generatedEmail.findUnique({
        where: { id: input.emailId },
        include: { campaign: { select: { userId: true } } },
      })
      if (!email || email.campaign.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'NOT_FOUND' })
      }
      return prisma.followUp.findMany({
        where: { emailId: input.emailId },
        orderBy: { sequence: 'asc' },
      })
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const followUp = await prisma.followUp.findUnique({
        where: { id: input.id },
        include: { email: { include: { campaign: { select: { userId: true } } } } },
      })
      if (!followUp || followUp.email.campaign.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'NOT_FOUND' })
      }
      if (followUp.status === 'SENT') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot cancel a sent follow-up' })
      }
      return prisma.followUp.update({
        where: { id: input.id },
        data: { status: 'CANCELLED' },
      })
    }),
})
