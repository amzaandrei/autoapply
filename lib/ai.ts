import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface CompanyResult {
  name: string
  domain: string
  industry: string
  size: string
  description: string
  contactEmail: string | null
  contactName: string | null
  linkedIn: string | null
  matchReason: string
  salaryRange?: string | null
  location?: string | null
}

export interface GeneratedEmailResult {
  subject: string
  body: string
}

export interface ParsedCV {
  fullName: string
  email: string | null
  phone: string | null
  location: string | null
  summary: string | null
  skills: string[]
  experience: Array<{
    company: string
    title: string
    startDate: string
    endDate: string | null
    current: boolean
    description: string
  }>
  education: Array<{
    institution: string
    degree: string
    field: string
    startDate: string
    endDate: string
  }>
}

export type EmailTone = 'concise' | 'balanced' | 'detailed'

const TONE_PROMPTS: Record<EmailTone, { wordLimit: string; structure: string }> = {
  concise: {
    wordLimit: 'Keep the total body under 80 words. Be direct — no filler.',
    structure: `Body structure (2 short paragraphs):
1. Opening: one sentence on why this company interests you + one sentence connecting your strongest skill. That's it.
2. Closing: clear call to action. 1 sentence.`,
  },
  balanced: {
    wordLimit: 'Keep the total body under 200 words.',
    structure: `Body structure (3 paragraphs):
1. Opening: specific to this company — mention something real about them or why you want to work there. 2-3 sentences.
2. Middle: connect your CV skills to what the company likely needs. Mention 1-2 specific skills or experiences. 2-3 sentences.
3. Closing: clear call to action, offer to discuss further. 1-2 sentences.`,
  },
  detailed: {
    wordLimit: 'Aim for 250-300 words. Be thorough but not verbose.',
    structure: `Body structure (4 paragraphs):
1. Opening: show genuine knowledge of the company — reference their product, mission, recent news, or industry position. 2-3 sentences.
2. Experience: connect 2-3 specific CV achievements to what the company needs. Use concrete numbers or outcomes where possible. 3-4 sentences.
3. Value proposition: explain what unique perspective or skills you'd bring to the team and how you'd contribute to their goals. 2-3 sentences.
4. Closing: confident call to action, suggest a specific next step (call, meeting). 1-2 sentences.`,
  },
}

export async function generateEmail(params: {
  cvText: string
  jobTitle: string
  companyName: string
  companyIndustry?: string | null
  companyDescription?: string | null
  companySize?: string | null
  contactName?: string | null
  skills?: string[]
  tone?: EmailTone
}): Promise<GeneratedEmailResult> {
  const cvSummary = params.cvText.slice(0, 3000)
  const greeting = params.contactName ? `Dear ${params.contactName},` : 'Dear Hiring Team,'
  const tone = params.tone ?? 'balanced'
  const { wordLimit, structure } = TONE_PROMPTS[tone]
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: `You are an expert job application writer. Write compelling, personalized cold outreach emails.

CRITICAL RULES:
- NEVER output placeholder text like [Your message here], [insert X], or any bracketed placeholders — write real content always
- Use the actual company name throughout, never "the company"
- ${wordLimit}
- Professional but natural tone — not robotic
- Do NOT include phone numbers in the email body
- Return ONLY valid JSON with keys "subject" and "body". No markdown fences.

${structure}`,
    messages: [
      {
        role: 'user',
        content: `Write a job application email for the following:

Target Role: ${params.jobTitle}
Company: ${params.companyName}
${params.companyIndustry ? `Industry: ${params.companyIndustry}` : ''}
${params.companySize ? `Company Size: ${params.companySize}` : ''}
${params.companyDescription ? `About the company: ${params.companyDescription}` : ''}
${params.contactName ? `Contact: ${params.contactName}` : ''}
${params.skills && params.skills.length > 0 ? `Key Skills: ${params.skills.join(', ')}` : ''}

My CV (summary):
${cvSummary}

Start the body with: "${greeting}"

IMPORTANT FORMATTING: Each paragraph MUST be separated by \\n\\n (two newlines) in the JSON string. The body must have exactly 3 paragraphs + the sign-off, each on its own block.

End with: "Best regards," on its own line (signature appended separately — do NOT include name, email, or phone).

Return JSON where the body uses \\n\\n between every paragraph:
{"subject": "Application for ${params.jobTitle} at ${params.companyName}", "body": "Dear Hiring Team,\\n\\nParagraph 1 here.\\n\\nParagraph 2 here.\\n\\nParagraph 3 here.\\n\\nBest regards,"}`,
      },
    ],
  })

  const text = response.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error('No text response from AI')

  const raw = text.text.trim()
  const jsonStr = raw.startsWith('{') ? raw : raw.match(/\{[\s\S]*\}/)?.[0] ?? raw
  const result = JSON.parse(jsonStr) as GeneratedEmailResult

  // Ensure paragraph breaks exist — if Claude returned a flat string, 
  // split on sentence-ending punctuation followed by capital letters
  if (result.body && !result.body.includes('\n')) {
    result.body = result.body
      .replace(/\. (Dear |I |My |With |Thank |Best |Please |Having )/g, '.\n\n$1')
      .replace(/(Best regards,)/g, '\n\n$1')
  }

  return result
}

const FOLLOWUP_PROMPTS: Record<number, string> = {
  1: 'This is a gentle first follow-up. Briefly reference the original email, express continued interest, and ask if they had a chance to review your application. Keep it under 60 words.',
  2: 'This is a second follow-up. Add something new — mention a recent accomplishment, skill, or insight relevant to the company. Show persistence without being pushy. Keep it under 80 words.',
  3: 'This is a final follow-up. Be brief and gracious. Let them know you are still interested but will not follow up again unless they respond. Keep it under 50 words.',
}

export async function generateFollowUp(params: {
  originalSubject: string
  originalBody: string
  companyName: string
  contactName?: string | null
  sequence: number
  cvText: string
  jobTitle: string
}): Promise<GeneratedEmailResult> {
  const sequencePrompt = FOLLOWUP_PROMPTS[params.sequence] ?? FOLLOWUP_PROMPTS[1]
  const greeting = params.contactName ? `Hi ${params.contactName},` : 'Hi,'

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: `You are writing a follow-up to a job application email that hasn't received a reply.

CRITICAL RULES:
- NEVER use placeholder text like [Your message here] or [insert X]
- Keep it shorter than the original email
- Professional but warm tone
- Do NOT include phone numbers
- Return ONLY valid JSON with keys "subject" and "body". No markdown fences.`,
    messages: [
      {
        role: 'user',
        content: `Write follow-up #${params.sequence} for this job application:

Company: ${params.companyName}
Role: ${params.jobTitle}
${params.contactName ? `Contact: ${params.contactName}` : ''}

Original email subject: ${params.originalSubject}
Original email body (first 500 chars): ${params.originalBody.slice(0, 500)}

${sequencePrompt}

Start the body with: "${greeting}"
End with: "Best regards," (signature appended separately).

Return JSON:
{"subject": "Re: ${params.originalSubject}", "body": "${greeting}\\n\\n...\\n\\nBest regards,"}`,
      },
    ],
  })

  const text = response.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error('No text response from AI')

  const raw = text.text.trim()
  const jsonStr = raw.startsWith('{') ? raw : raw.match(/\{[\s\S]*\}/)?.[0] ?? raw
  return JSON.parse(jsonStr) as GeneratedEmailResult
}

export type SearchMode = 'all' | 'top10' | 'best3'

const SEARCH_MODE_PROMPTS: Record<SearchMode, { count: string; instruction: string }> = {
  all: {
    count: '15-25',
    instruction: 'Cast a wide net. Include every company that could plausibly be hiring for this role — startups, mid-size, and large. Prioritize quantity so the candidate can apply broadly.',
  },
  top10: {
    count: '10',
    instruction: 'Find the 10 most relevant companies. Balance fit, growth stage, and likelihood of hiring. Exclude companies that are a weak match.',
  },
  best3: {
    count: '3',
    instruction: 'Find ONLY the 3 best-fit companies. These must be strong matches where the candidate\'s background aligns closely with what the company needs. Quality over quantity — explain in matchReason why each is an excellent fit.',
  },
}

export async function discoverCompanies(params: {
  jobTitle: string
  industry: string
  region: string
  additionalContext?: string
  searchMode?: SearchMode
}): Promise<CompanyResult[]> {
  const mode = params.searchMode ?? 'top10'
  const { count, instruction } = SEARCH_MODE_PROMPTS[mode]
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: `You are a job market researcher specializing in finding companies that are actively hiring.
Search for real companies and return ONLY valid JSON. No markdown fences, no explanation.`,
    messages: [
      {
        role: 'user',
        content: `Find ${count} companies that match this profile:
- Looking for: ${params.jobTitle}
- Industry: ${params.industry}
- Region: ${params.region}
${params.additionalContext ? `- Additional context: ${params.additionalContext}` : ''}

${instruction}

Search for companies that are actively hiring or growing. Find their hiring contact emails where possible.

Return JSON with this exact schema:
{
  "companies": [
    {
      "name": "string",
      "domain": "string (e.g. acme.com)",
      "industry": "string",
      "size": "string (e.g. 10-50, 51-200, 201-1000, 1000+)",
      "description": "string (2-3 sentences about the company)",
      "contactEmail": "string | null (careers@, jobs@, hiring@ email if findable)",
      "contactName": "string | null",
      "linkedIn": "string | null (LinkedIn company URL)",
      "matchReason": "string (why this company is a good match)"
    }
  ]
}`,
      },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: ([
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 6,
        allowed_domains: [
          'linkedin.com',
          'crunchbase.com',
          'wellfound.com',
          'builtin.com',
          'greenhouse.io',
          'lever.co',
          'techcrunch.com',
        ],
      },
    ] as unknown) as Anthropic.Messages.Tool[],
  })

  const textBlocks = response.content.filter(
    (b): b is Anthropic.TextBlock => b.type === 'text'
  )
  const finalText = textBlocks[textBlocks.length - 1]?.text ?? ''
  const jsonStr = finalText.match(/\{[\s\S]*\}/)?.[0] ?? finalText

  const parsed = JSON.parse(jsonStr) as { companies: CompanyResult[] }
  return parsed.companies ?? []
}

export async function parseCVFromBase64(pdfBase64: string): Promise<ParsedCV> {
  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    system: `You are an expert resume parser. Extract all candidate information.
Return ONLY a valid JSON object — no markdown fences, no explanation.
If a field is not present, use null. Normalize dates to YYYY-MM format.
Skills as a flat array of individual skill strings.`,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBase64,
            },
          } as Anthropic.DocumentBlockParam,
          {
            type: 'text',
            text: `Extract all structured data from this CV and return JSON:
{
  "fullName": "",
  "email": null,
  "phone": null,
  "location": null,
  "summary": null,
  "skills": [],
  "experience": [{"company":"","title":"","startDate":"","endDate":null,"current":false,"description":""}],
  "education": [{"institution":"","degree":"","field":"","startDate":"","endDate":""}]
}`,
          },
        ],
      },
    ],
  })

  const text = response.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error('No text response from CV parse')

  const raw = text.text.trim()
  const jsonStr = raw.startsWith('{') ? raw : raw.match(/\{[\s\S]*\}/)?.[0] ?? raw
  return JSON.parse(jsonStr) as ParsedCV
}

export async function parseCVFromText(cvText: string): Promise<ParsedCV> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: `You are an expert resume parser. Extract all candidate information.
Return ONLY a valid JSON object — no markdown fences, no explanation.
If a field is not present, use null. Normalize dates to YYYY-MM format.
Skills as a flat array of individual skill strings.`,
    messages: [
      {
        role: 'user',
        content: `CV content:\n\n${cvText}\n\nExtract all structured data and return JSON:
{
  "fullName": "",
  "email": null,
  "phone": null,
  "location": null,
  "summary": null,
  "skills": [],
  "experience": [{"company":"","title":"","startDate":"","endDate":null,"current":false,"description":""}],
  "education": [{"institution":"","degree":"","field":"","startDate":"","endDate":""}]
}`,
      },
    ],
  })

  const text = response.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error('No text response from CV parse')

  const raw = text.text.trim()
  const jsonStr = raw.startsWith('{') ? raw : raw.match(/\{[\s\S]*\}/)?.[0] ?? raw
  return JSON.parse(jsonStr) as ParsedCV
}

// ─── Bulk Re-discovery ───────────────────────────────────────────────────

export async function discoverSimilarCompanies(params: {
  existingCompanies: Array<{ name: string; industry?: string | null; size?: string | null }>
  jobTitle: string
  region: string
  count?: number
}): Promise<CompanyResult[]> {
  const companyList = params.existingCompanies.map((c) => `${c.name} (${c.industry ?? 'unknown'}, ${c.size ?? ''})`).join('\n')
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: `You are a job market researcher. Find companies similar to the ones provided. Return ONLY valid JSON. No markdown fences.`,
    messages: [{ role: 'user', content: `I've been applying to:\n${companyList}\n\nFind ${params.count ?? 10} MORE similar companies in ${params.region} for: ${params.jobTitle}. Do NOT include companies already listed.\n\nReturn JSON: { "companies": [{ "name":"", "domain":"", "industry":"", "size":"", "description":"", "contactEmail":null, "contactName":null, "linkedIn":null, "matchReason":"" }] }` }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: ([{ type: 'web_search_20250305', name: 'web_search', max_uses: 6, allowed_domains: ['linkedin.com','crunchbase.com','wellfound.com','builtin.com','greenhouse.io','lever.co','techcrunch.com'] }] as unknown) as Anthropic.Messages.Tool[],
  })
  const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text')
  const finalText = textBlocks[textBlocks.length - 1]?.text ?? ''
  const jsonStr = finalText.match(/\{[\s\S]*\}/)?.[0] ?? finalText
  return (JSON.parse(jsonStr) as { companies: CompanyResult[] }).companies ?? []
}

// ─── Company Enrichment ──────────────────────────────────────────────────

export interface CompanyEnrichment {
  techStack: string[]
  recentFunding: string | null
  employeeGrowth: string | null
  glassdoorRating: string | null
  keyProducts: string[]
  hiringSignals: string[]
  summary: string
}

export async function enrichCompany(params: { name: string; domain?: string | null; industry?: string | null }): Promise<CompanyEnrichment> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: `You are a company research analyst. Return ONLY valid JSON. No markdown fences.`,
    messages: [{ role: 'user', content: `Research: ${params.name}${params.domain ? ` (${params.domain})` : ''}${params.industry ? `, ${params.industry}` : ''}\n\nReturn JSON: { "techStack":[], "recentFunding":null, "employeeGrowth":null, "glassdoorRating":null, "keyProducts":[], "hiringSignals":[], "summary":"2-3 sentence executive summary for a job applicant" }` }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: ([{ type: 'web_search_20250305', name: 'web_search', max_uses: 4, allowed_domains: ['linkedin.com','crunchbase.com','glassdoor.com','builtin.com','techcrunch.com','github.com'] }] as unknown) as Anthropic.Messages.Tool[],
  })
  const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text')
  const finalText = textBlocks[textBlocks.length - 1]?.text ?? ''
  const jsonStr = finalText.match(/\{[\s\S]*\}/)?.[0] ?? finalText
  return JSON.parse(jsonStr) as CompanyEnrichment
}

// ─── CV Tailoring ────────────────────────────────────────────────────────

export async function tailorCVForCompany(params: {
  cvText: string; companyName: string; companyDescription?: string | null; companyIndustry?: string | null; jobTitle: string; skills: string[]
}): Promise<{ tailoredSummary: string; emphasizedSkills: string[]; adjustedExperience: string }> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: `You are a CV optimization expert. Tailor CV focus for a specific company. Do NOT fabricate experience — only re-emphasize existing skills. Return ONLY valid JSON.`,
    messages: [{ role: 'user', content: `Tailor for ${params.companyName} (${params.companyIndustry ?? ''})${params.companyDescription ? `: ${params.companyDescription.slice(0, 300)}` : ''}. Role: ${params.jobTitle}. Skills: ${params.skills.join(', ')}\n\nCV:\n${params.cvText.slice(0, 2000)}\n\nReturn JSON: { "tailoredSummary":"2-3 sentences", "emphasizedSkills":["top 5-8 relevant skills"], "adjustedExperience":"paragraph highlighting most relevant experience" }` }],
  })
  const text = response.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error('No response')
  const raw = text.text.trim()
  const jsonStr = raw.startsWith('{') ? raw : raw.match(/\{[\s\S]*\}/)?.[0] ?? raw
  return JSON.parse(jsonStr)
}

// ─── Find Contact Email ──────────────────────────────────────────────────
// Uses web search to discover the hiring/careers email of a company

export async function findCompanyContactEmail(params: {
  companyName: string
  domain?: string | null
}): Promise<{ email: string | null; reasoning: string }> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: `You are a research assistant that finds the hiring/careers contact email for a company.
Search the web (LinkedIn, company website, job listings). Return ONLY valid JSON. No markdown fences.

If you find multiple candidates, prefer in this order: careers@, jobs@, hiring@, talent@, recruitment@, hr@.
Only return an email you are confident exists. Otherwise return null.`,
    messages: [{
      role: 'user',
      content: `Find the hiring contact email for this company:

Company: ${params.companyName}
${params.domain ? `Domain: ${params.domain}` : ''}

Search for their careers page, job listings, or LinkedIn company page. Return JSON:
{ "email": "address@domain.com or null", "reasoning": "where you found it" }`,
    }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: ([
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 4,
        allowed_domains: ['linkedin.com', 'crunchbase.com', 'wellfound.com', 'builtin.com', 'greenhouse.io', 'lever.co'],
      },
    ] as unknown) as Anthropic.Messages.Tool[],
  })

  const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text')
  const finalText = textBlocks[textBlocks.length - 1]?.text ?? ''
  const jsonStr = finalText.match(/\{[\s\S]*\}/)?.[0] ?? finalText
  try {
    const parsed = JSON.parse(jsonStr) as { email: string | null; reasoning: string }
    return { email: parsed.email, reasoning: parsed.reasoning ?? '' }
  } catch {
    return { email: null, reasoning: 'Could not parse response' }
  }
}
