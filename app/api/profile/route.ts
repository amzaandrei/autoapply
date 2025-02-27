import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      createdAt: true,
      profile: {
        select: {
          id: true,
          cvUrl: true,
          cvText: true,
          jobTitle: true,
          skills: true,
          bio: true,
          linkedIn: true,
          portfolio: true,
          updatedAt: true,
        },
      },
    },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json(user)
}

export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Allowed user fields
  const userUpdates: { name?: string; image?: string } = {}
  if (typeof body.name === 'string') userUpdates.name = body.name.trim()
  if (typeof body.image === 'string') userUpdates.image = body.image.trim()

  // Allowed profile fields
  const profileUpdates: {
    jobTitle?: string
    skills?: string[]
    bio?: string
    linkedIn?: string
    portfolio?: string
    cvUrl?: string
  } = {}
  if (typeof body.jobTitle === 'string') profileUpdates.jobTitle = body.jobTitle.trim()
  if (Array.isArray(body.skills)) profileUpdates.skills = body.skills.map(String)
  if (typeof body.bio === 'string') profileUpdates.bio = body.bio.trim()
  if (typeof body.linkedIn === 'string') profileUpdates.linkedIn = body.linkedIn.trim()
  if (typeof body.portfolio === 'string') profileUpdates.portfolio = body.portfolio.trim()
  if (typeof body.cvUrl === 'string') profileUpdates.cvUrl = body.cvUrl.trim()

  if (Object.keys(userUpdates).length > 0) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: userUpdates,
    })
  }

  if (Object.keys(profileUpdates).length > 0) {
    await prisma.userProfile.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, ...profileUpdates },
      update: profileUpdates,
    })
  }

  const updated = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      profile: {
        select: {
          cvUrl: true,
          cvText: true,
          jobTitle: true,
          skills: true,
          bio: true,
          linkedIn: true,
          portfolio: true,
        },
      },
    },
  })

  return NextResponse.json(updated)
}
