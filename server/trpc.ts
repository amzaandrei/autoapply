import { initTRPC, TRPCError } from '@trpc/server'
import { auth } from '@/auth'
import { ZodError } from 'zod'

export const createContext = async () => {
  const session = await auth()
  return { session }
}

type Context = Awaited<ReturnType<typeof createContext>>

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    }
  },
})

export const router = t.router
export const publicProcedure = t.procedure
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  const session = ctx.session as typeof ctx.session & { user: { id: string } }
  return next({ ctx: { ...ctx, session } })
})
