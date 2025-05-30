import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'

export const blacklistRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return prisma.blacklistedCompany.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { createdAt: 'desc' },
    })
  }),

  add: protectedProcedure
    .input(z.object({ name: z.string().min(1), domain: z.string().optional(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return prisma.blacklistedCompany.upsert({
        where: { userId_name: { userId: ctx.session.user.id, name: input.name } },
        create: { userId: ctx.session.user.id, ...input },
        update: { reason: input.reason },
      })
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return prisma.blacklistedCompany.deleteMany({
        where: { id: input.id, userId: ctx.session.user.id },
      })
    }),

  check: protectedProcedure
    .input(z.object({ names: z.array(z.string()) }))
    .query(async ({ ctx, input }) => {
      return prisma.blacklistedCompany.findMany({
        where: { userId: ctx.session.user.id, name: { in: input.names, mode: 'insensitive' } },
        select: { name: true },
      })
    }),
})
