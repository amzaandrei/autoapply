import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'

const REQUIRED_SCOPES = ['gmail.send', 'gmail.readonly']

export const gmailRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    const token = await prisma.gmailToken.findUnique({
      where: { userId: ctx.session.user.id },
      select: { id: true, expiresAt: true, scope: true, createdAt: true },
    })
    const needsReauth = token ? !REQUIRED_SCOPES.every((s) => token.scope?.includes(s)) : false
    return { connected: !!token, needsReauth, token }
  }),

  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    await prisma.gmailToken.deleteMany({ where: { userId: ctx.session.user.id } })
    return { disconnected: true }
  }),
})
