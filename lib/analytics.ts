/**
 * Analytics wrapper. Server-safe: no-ops when NEXT_PUBLIC_POSTHOG_KEY is unset,
 * so the app still runs fine without PostHog configured.
 */
import { PostHog } from 'posthog-node'

let serverClient: PostHog | null = null

function getServerClient(): PostHog | null {
  if (serverClient) return serverClient
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'
  if (!key) return null
  serverClient = new PostHog(key, { host, flushAt: 1, flushInterval: 0 })
  return serverClient
}

export type AnalyticsEvent =
  | 'signed_up'
  | 'campaign_created'
  | 'companies_discovered'
  | 'emails_generated'
  | 'email_sent'
  | 'email_replied'
  | 'upgraded_to_pro'
  | 'downgraded_to_free'
  | 'gate_hit'
  | 'follow_up_sent'

export function track(
  distinctId: string,
  event: AnalyticsEvent,
  properties?: Record<string, unknown>,
): void {
  const client = getServerClient()
  if (!client) return
  try {
    client.capture({ distinctId, event, properties })
  } catch {
    // swallow — analytics must never fail a request
  }
}

export function identify(distinctId: string, traits?: Record<string, unknown>): void {
  const client = getServerClient()
  if (!client) return
  try {
    client.identify({ distinctId, properties: traits })
  } catch {
    // swallow
  }
}

export async function flushAnalytics(): Promise<void> {
  const client = getServerClient()
  if (!client) return
  try {
    await client.shutdown()
  } catch {
    // ignore
  }
}
