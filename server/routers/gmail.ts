import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'

export const gmailRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    const token = await prisma.gmailToken.findUnique({
      where: { userId: ctx.session.user.id },
      select: { id: true, expiresAt: true, scope: true, createdAt: true },
    })
    return { connected: !!token, token }
  }),

  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    await prisma.gmailToken.deleteMany({ where: { userId: ctx.session.user.id } })
    return { disconnected: true }
  }),
})
