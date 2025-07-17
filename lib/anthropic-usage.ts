/**
 * Records actual Anthropic token usage from `response.usage` on each message call,
 * so we can report precise spend instead of per-call estimates.
 *
 * Pricing for Sonnet 4.6 lives in `app/api/admin/stats/route.ts` and is applied at
 * aggregation time — we only store raw token counts here.
 */
import { incrementUsage } from './entitlements'

interface UsageLike {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

export async function recordAnthropicUsage(
  userId: string | null | undefined,
  usage: UsageLike | null | undefined,
): Promise<void> {
  if (!userId || !usage) return
  const input =
    (usage.input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0)
  const output = usage.output_tokens ?? 0
  try {
    await Promise.all([
      input > 0 ? incrementUsage(userId, 'ai_input_tokens', input) : Promise.resolve(),
      output > 0 ? incrementUsage(userId, 'ai_output_tokens', output) : Promise.resolve(),
    ])
  } catch {
    // Never fail the user's request because we couldn't record telemetry
  }
}
