import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import Google from 'next-auth/providers/google'
import LinkedIn from 'next-auth/providers/linkedin'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma, withDbRetry } from '@/lib/prisma'
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

        const user = await withDbRetry(() => prisma.user.findUnique({ where: { email } }))
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
      // Refresh tier + admin status on sign-in or when client calls update()
      if (token.id && (user || trigger === 'update')) {
        // If this throws, NextAuth surfaces a `Configuration` error and the
        // user lands on the "Server error" page — even though the failure is
        // a transient DB hiccup. Retry, and on final failure preserve the
        // existing token values so auth still completes; the next request
        // (or `update()` call) will refresh them.
        try {
          const [sub, dbUser] = await withDbRetry(() =>
            Promise.all([
              prisma.subscription.findUnique({
                where: { userId: token.id as string },
                select: { tier: true, status: true },
              }),
              prisma.user.findUnique({
                where: { id: token.id as string },
                select: { email: true },
              }),
            ]),
          )
          const active = sub && (sub.status === 'ACTIVE' || sub.status === 'TRIALING')
          // Prisma SubscriptionTier maps 1:1 to our local Tier union.
          token.tier = active ? (sub.tier as 'FREE' | 'STARTER' | 'PRO' | 'POWER') : 'FREE'
          const { isAdminEmail } = await import('@/lib/admin')
          token.isAdmin = isAdminEmail(dbUser?.email ?? (token.email as string | undefined))
        } catch (err) {
          const Sentry = await import('@sentry/nextjs')
          Sentry.captureException(err, { tags: { source: 'auth.jwt' } })
          token.tier = (token.tier as 'FREE' | 'STARTER' | 'PRO' | 'POWER' | undefined) ?? 'FREE'
          token.isAdmin = token.isAdmin === true
        }
      }
      return token
    },
    async session({ session, token }) {
      if (token.id) session.user.id = token.id as string
      session.user.tier =
        (token.tier as 'FREE' | 'STARTER' | 'PRO' | 'POWER' | undefined) ?? 'FREE'
      session.user.isAdmin = token.isAdmin === true
      return session
    },
  },
})
