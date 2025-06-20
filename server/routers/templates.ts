import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { TRPCError } from '@trpc/server'

const templateInput = z.object({
  name: z.string().min(1).max(80),
  selectedRoles: z.array(z.string()).optional(),
  jobTitle: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  searchMode: z.enum(['all', 'top10', 'best3']).optional(),
  dataSource: z.enum(['ai', 'jobs', 'both']).optional(),
  useEmailTemplate: z.boolean().optional(),
  attachCv: z.boolean().optional(),
  followUpEnabled: z.boolean().optional(),
  followUpDelayDays: z.number().int().min(1).max(30).optional(),
  maxFollowUps: z.number().int().min(1).max(3).optional(),
  abTestEnabled: z.boolean().optional(),
  abToneA: z.enum(['concise', 'balanced', 'detailed']).optional(),
  abToneB: z.enum(['concise', 'balanced', 'detailed']).optional(),
})

export const templatesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return prisma.campaignTemplate.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { updatedAt: 'desc' },
    })
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const tpl = await prisma.campaignTemplate.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
      })
      if (!tpl) throw new TRPCError({ code: 'NOT_FOUND' })
      return tpl
    }),

  create: protectedProcedure
    .input(templateInput)
    .mutation(async ({ ctx, input }) => {
      return prisma.campaignTemplate.create({
        data: {
          userId: ctx.session.user.id,
          ...input,
          jobTitle: input.jobTitle ?? undefined,
          industry: input.industry ?? undefined,
          region: input.region ?? undefined,
        },
      })
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string() }).merge(templateInput.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      const existing = await prisma.campaignTemplate.findFirst({
        where: { id, userId: ctx.session.user.id },
      })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      return prisma.campaignTemplate.update({
        where: { id },
        data: {
          ...data,
          jobTitle: data.jobTitle ?? undefined,
          industry: data.industry ?? undefined,
          region: data.region ?? undefined,
        },
      })
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.campaignTemplate.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
      })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      await prisma.campaignTemplate.delete({ where: { id: input.id } })
      return { ok: true }
    }),

  // Save from an existing campaign — copies settings + accepts extra discovery fields from the UI
  saveFromCampaign: protectedProcedure
    .input(z.object({
      campaignId: z.string(),
      name: z.string().min(1).max(80),
      jobTitle: z.string().optional(),
      industry: z.string().optional(),
      region: z.string().optional(),
      searchMode: z.enum(['all', 'top10', 'best3']).optional(),
      dataSource: z.enum(['ai', 'jobs', 'both']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const campaign = await prisma.campaign.findFirst({
        where: { id: input.campaignId, userId: ctx.session.user.id },
      })
      if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' })

      // Campaign.name is a comma-separated list of roles
      const roles = campaign.name.split(',').map((s) => s.trim()).filter(Boolean)

      return prisma.campaignTemplate.create({
        data: {
          userId: ctx.session.user.id,
          name: input.name,
          selectedRoles: roles,
          jobTitle: input.jobTitle ?? campaign.jobTitle ?? undefined,
          industry: input.industry,
          region: input.region,
          searchMode: input.searchMode,
          dataSource: input.dataSource,
          useEmailTemplate: campaign.useEmailTemplate,
          attachCv: campaign.attachCv,
          followUpEnabled: campaign.followUpEnabled,
          followUpDelayDays: campaign.followUpDelayDays,
          maxFollowUps: campaign.maxFollowUps,
          abTestEnabled: campaign.abTestEnabled,
          abToneA: campaign.abToneA,
          abToneB: campaign.abToneB,
        },
      })
    }),

  // Get defaults for auto-fill on fresh campaign — from most recent campaign + template
  getLastCampaignDefaults: protectedProcedure.query(async ({ ctx }) => {
    const lastCampaign = await prisma.campaign.findFirst({
      where: { userId: ctx.session.user.id },
      orderBy: { createdAt: 'desc' },
    })
    if (!lastCampaign) return null
    return {
      selectedRoles: lastCampaign.name.split(',').map((s) => s.trim()).filter(Boolean),
      jobTitle: lastCampaign.jobTitle,
      useEmailTemplate: lastCampaign.useEmailTemplate,
      attachCv: lastCampaign.attachCv,
      followUpEnabled: lastCampaign.followUpEnabled,
      followUpDelayDays: lastCampaign.followUpDelayDays,
      maxFollowUps: lastCampaign.maxFollowUps,
      abTestEnabled: lastCampaign.abTestEnabled,
      abToneA: lastCampaign.abToneA,
      abToneB: lastCampaign.abToneB,
    }
  }),
})
