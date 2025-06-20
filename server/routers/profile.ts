import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'

export const profileRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    return prisma.userProfile.findUnique({
      where: { userId: ctx.session.user.id },
    })
  }),

  upsert: protectedProcedure
    .input(z.object({
      cvText: z.string().optional(),
      cvUrl: z.string().optional(),
      cvPdfBase64: z.string().optional(),
      jobTitle: z.string().optional(),
      skills: z.array(z.string()).optional(),
      bio: z.string().optional(),
      linkedIn: z.string().optional(),
      portfolio: z.string().optional(),
      emailTemplate: z.string().optional(),
      useEmailTemplate: z.boolean().optional(),
      signatureName: z.string().optional(),
      signaturePhone: z.string().optional(),
      signatureAddress: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return prisma.userProfile.upsert({
        where: { userId: ctx.session.user.id },
        create: { ...input, userId: ctx.session.user.id },
        update: input,
      })
    }),
})
