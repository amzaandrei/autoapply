import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/auth'

type AuthedHandler<R> = (req: NextRequest, ctx: { userId: string }) => Promise<R>
type NoArgAuthedHandler<R> = (ctx: { userId: string }) => Promise<R>
type AuthedParamsHandler<P, R> = (req: NextRequest, ctx: { userId: string; params: P }) => Promise<R>

export function withAuth<R>(handler: AuthedHandler<R>): (req: NextRequest) => Promise<R | NextResponse> {
  return async (req) => {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return handler(req, { userId: session.user.id })
  }
}

export function withAuthNoReq<R>(handler: NoArgAuthedHandler<R>): () => Promise<R | NextResponse> {
  return async () => {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return handler({ userId: session.user.id })
  }
}

/**
 * Wraps a route handler that takes a Next.js route params object. Resolves the
 * promised params and runs the same auth check as withAuth.
 */
export function withAuthParams<P, R>(
  handler: AuthedParamsHandler<P, R>,
): (req: NextRequest, args: { params: Promise<P> }) => Promise<R | NextResponse> {
  return async (req, { params }) => {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return handler(req, { userId: session.user.id, params: await params })
  }
}
