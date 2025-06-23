'use client'

import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { httpBatchLink } from '@trpc/client'
import { trpc } from '@/lib/trpc'
import posthog from 'posthog-js'
import { useSession } from 'next-auth/react'

function PostHogIdentify() {
  const { data: session } = useSession()
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!key) return
    if (!(posthog as any).__loaded) {
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
        capture_pageview: true,
        capture_pageleave: true,
        autocapture: false,
      })
      ;(posthog as any).__loaded = true
    }
    if (session?.user?.id) {
      posthog.identify(session.user.id, {
        email: session.user.email ?? undefined,
        name: session.user.name ?? undefined,
      })
    }
  }, [session?.user?.id, session?.user?.email, session?.user?.name])
  return null
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,        // Data stays fresh for 30s — no refetch on mount
        gcTime: 5 * 60_000,       // Cache kept for 5 min after unmount
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  }))
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: '/api/trpc',
        }),
      ],
    })
  )

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <PostHogIdentify />
        {children}
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </trpc.Provider>
  )
}
