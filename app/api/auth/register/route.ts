import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/client-ip'

export async function POST(req: Request) {
  // Signup-spam / abuse protection: cap sign-ups per client IP (10 / hour).
  // Fail OPEN: a limiter hiccup must never block a legitimate sign-up.
  try {
    const ip = getClientIp(req.headers)
    const limit = rateLimit(`register:${ip}`, 10, 60 * 60 * 1000)
    if (!limit.allowed) {
      return NextResponse.json({
        error: `Rate limit: too many sign-up attempts. Try again in ${Math.ceil(limit.resetIn / 60)} minutes.`,
      }, { status: 429 })
    }
  } catch {
    // Limiter backend unavailable — allow the request through.
  }

  const { email, password, name } = await req.json()

  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })
  if (!password || password.length < 8)
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return NextResponse.json({ error: 'Email already in use' }, { status: 409 })

  const hashed = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: { email, password: hashed, name: name ?? email.split('@')[0] },
    select: { id: true, email: true, name: true },
  })

  return NextResponse.json({ ok: true, user })
}
