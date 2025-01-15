import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // Create demo user
  const hashed = await bcrypt.hash('password123', 12)
  const user = await prisma.user.upsert({
    where: { email: 'demo@autoapply.dev' },
    update: {},
    create: {
      email: 'demo@autoapply.dev',
      name: 'Demo User',
      password: hashed,
    },
  })

  // Create demo profile
  await prisma.userProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      jobTitle: 'Senior Software Engineer',
      skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL'],
      bio: 'Full-stack engineer with 5+ years building scalable web applications.',
    },
  })

  console.log('Seed complete. Demo user: demo@autoapply.dev / password123')
}

main().catch(console.error).finally(() => prisma.$disconnect())
