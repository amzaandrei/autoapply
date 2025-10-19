import type Anthropic from '@anthropic-ai/sdk'

const DEFAULT_SEARCH_DOMAINS = [
  'linkedin.com',
  'crunchbase.com',
  'wellfound.com',
  'builtin.com',
  'greenhouse.io',
  'lever.co',
  'techcrunch.com',
]

export function webSearchTool(
  maxUses: number,
  allowedDomains: string[] = DEFAULT_SEARCH_DOMAINS,
): Anthropic.Messages.Tool[] {
  // The web_search_20250305 tool isn't yet typed in the SDK — cast through unknown.
  return ([
    {
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: maxUses,
      allowed_domains: allowedDomains,
    },
  ] as unknown) as Anthropic.Messages.Tool[]
}

export function parseJsonFromResponse<T>(
  response: Anthropic.Messages.Message,
  label: string,
): T {
  const text = response.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error(`No text response from ${label}`)

  const raw = text.text.trim()
  const jsonStr = raw.startsWith('{') ? raw : raw.match(/\{[\s\S]*\}/)?.[0] ?? raw
  return JSON.parse(jsonStr) as T
}

export function parseJsonFromWebSearchResponse<T>(response: Anthropic.Messages.Message): T {
  const textBlocks = response.content.filter(
    (b): b is Anthropic.TextBlock => b.type === 'text',
  )
  const finalText = textBlocks[textBlocks.length - 1]?.text ?? ''
  const jsonStr = finalText.match(/\{[\s\S]*\}/)?.[0] ?? finalText
  return JSON.parse(jsonStr) as T
}
