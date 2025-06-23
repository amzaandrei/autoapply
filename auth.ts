import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import Google from 'next-auth/providers/google'
import LinkedIn from 'next-auth/providers/linkedin'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { authConfig } from './auth.config'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    LinkedIn({
      clientId: process.env.LINKEDIN_CLIENT_ID!,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
    Credentials({
      async authorize(credentials) {
        const { email, password } = credentials as { email: string; password: string }
        if (!email || !password) return null

        const user = await prisma.user.findUnique({ where: { email } })
        if (!user?.password) return null

        const valid = await bcrypt.compare(password, user.password)
        if (!valid) return null

        return user
      },
    }),
  ],
  events: {
    async signIn({ user, account, profile }) {
      if (!user.id) return

      // Auto-populate UserProfile on any OAuth sign-in
      if (account?.provider === 'linkedin' || account?.provider === 'google') {
        const existing = await prisma.userProfile.findUnique({ where: { userId: user.id } })

        const profileData: Record<string, unknown> = {}

        // Name → signatureName (if not already set)
        if (!existing?.signatureName && user.name) {
          profileData.signatureName = user.name
        }

        // LinkedIn-specific: set LinkedIn URL
        if (account.provider === 'linkedin') {
          if (!existing?.linkedIn) {
            profileData.linkedIn = `https://www.linkedin.com`
          }
        }

        if (Object.keys(profileData).length > 0) {
          await prisma.userProfile.upsert({
            where: { userId: user.id },
            create: { userId: user.id, ...profileData },
            update: profileData,
          })
        }
      }
    },
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) token.id = user.id
      // Refresh tier on sign-in or when client calls update()
      if (token.id && (user || trigger === 'update')) {
        const sub = await prisma.subscription.findUnique({
          where: { userId: token.id as string },
          select: { tier: true, status: true },
        })
        const active = sub && (sub.status === 'ACTIVE' || sub.status === 'TRIALING')
        token.tier = active && sub?.tier === 'PRO' ? 'PRO' : 'FREE'
      }
      return token
    },
    async session({ session, token }) {
      if (token.id) session.user.id = token.id as string
      session.user.tier = (token.tier as 'FREE' | 'PRO') ?? 'FREE'
      return session
    },
  },
})
