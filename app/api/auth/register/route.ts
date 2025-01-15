import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
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
