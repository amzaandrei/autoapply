import Anthropic from '@anthropic-ai/sdk'
import { wrapAnthropic } from 'langsmith/wrappers/anthropic'

// Shared Anthropic client. When LANGSMITH_TRACING=true and LANGSMITH_API_KEY is
// set, every messages.create call is traced to LangSmith. Without those env
// vars, wrapAnthropic short-circuits to a no-op so production keeps running.
export const anthropic = wrapAnthropic(
  new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
)

export type { Anthropic }
