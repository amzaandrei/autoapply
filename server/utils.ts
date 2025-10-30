import { TRPCError } from '@trpc/server'
import { prisma } from '@/lib/prisma'

/**
 * Look up a user-owned campaign by id, or throw NOT_FOUND. Used everywhere a
 * tRPC procedure needs to gate access to a campaign-scoped resource.
 */
export async function findOwnedCampaign(id: string, userId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id, userId } })
  if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' })
  return campaign
}

/**
 * Look up a company and verify its parent campaign belongs to the user.
 * Returns the company on success or throws NOT_FOUND.
 */
export async function findOwnedCompany(id: string, userId: string) {
  const company = await prisma.company.findUnique({
    where: { id },
    include: { campaign: { select: { userId: true } } },
  })
  if (!company || company.campaign.userId !== userId) {
    throw new TRPCError({ code: 'NOT_FOUND' })
  }
  return company
}

/**
 * Look up a generated email and verify its parent campaign belongs to the
 * user. Returns the email on success or throws NOT_FOUND.
 */
export async function findOwnedGeneratedEmail(id: string, userId: string) {
  const email = await prisma.generatedEmail.findUnique({
    where: { id },
    include: { campaign: { select: { userId: true } } },
  })
  if (!email || email.campaign.userId !== userId) {
    throw new TRPCError({ code: 'NOT_FOUND' })
  }
  return email
}
