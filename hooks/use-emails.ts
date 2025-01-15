import { trpc } from '@/lib/trpc'

export function useEmails(campaignId: string) {
  return trpc.emails.list.useQuery({ campaignId }, { enabled: !!campaignId })
}

export function useCreateEmail() {
  const utils = trpc.useUtils()
  return trpc.emails.create.useMutation({
    onSuccess: (_, vars) => utils.emails.list.invalidate({ campaignId: vars.campaignId }),
  })
}

export function useUpdateEmail(campaignId: string) {
  const utils = trpc.useUtils()
  return trpc.emails.update.useMutation({
    onSuccess: () => utils.emails.list.invalidate({ campaignId }),
  })
}

export function useMarkEmailSent(campaignId: string) {
  const utils = trpc.useUtils()
  return trpc.emails.markSent.useMutation({
    onSuccess: () => utils.emails.list.invalidate({ campaignId }),
  })
}
