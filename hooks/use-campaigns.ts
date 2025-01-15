import { trpc } from '@/lib/trpc'

export function useCampaigns() {
  return trpc.campaigns.list.useQuery()
}

export function useCampaign(id: string) {
  return trpc.campaigns.getById.useQuery({ id }, { enabled: !!id })
}

export function useCreateCampaign() {
  const utils = trpc.useUtils()
  return trpc.campaigns.create.useMutation({
    onSuccess: () => utils.campaigns.list.invalidate(),
  })
}

export function useUpdateCampaign() {
  const utils = trpc.useUtils()
  return trpc.campaigns.update.useMutation({
    onSuccess: (_, vars) => {
      utils.campaigns.list.invalidate()
      utils.campaigns.getById.invalidate({ id: vars.id })
    },
  })
}

export function useDeleteCampaign() {
  const utils = trpc.useUtils()
  return trpc.campaigns.delete.useMutation({
    onSuccess: () => utils.campaigns.list.invalidate(),
  })
}
