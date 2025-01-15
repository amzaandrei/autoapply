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

export async function generateEmail(params: {
  cvText: string
  jobTitle: string
  companyName: string
  companyIndustry?: string | null
  companyDescription?: string | null
  companySize?: string | null
  contactName?: string | null
}): Promise<GeneratedEmailResult> {
  const cvSummary = params.cvText.slice(0, 3000)
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: `You are an expert job application writer. Write a compelling, personalized cold outreach email.
Be concise, professional, and specific to the company.
Return ONLY valid JSON with keys "subject" and "body". No markdown fences.`,
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

My CV (summary):
${cvSummary}

Write a 3-4 paragraph email. Keep it concise and compelling.
Return JSON: {"subject": "...", "body": "..."}`,
      },
    ],
  })

  const text = response.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error('No text response from AI')

  const raw = text.text.trim()
  const jsonStr = raw.startsWith('{') ? raw : raw.match(/\{[\s\S]*\}/)?.[0] ?? raw
  return JSON.parse(jsonStr) as GeneratedEmailResult
}

export async function discoverCompanies(params: {
  jobTitle: string
  industry: string
  region: string
  additionalContext?: string
}): Promise<CompanyResult[]> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: `You are a job market researcher specializing in finding companies that are actively hiring.
Search for real companies and return ONLY valid JSON. No markdown fences, no explanation.`,
    messages: [
      {
        role: 'user',
        content: `Find 8-12 companies that match this profile:
- Looking for: ${params.jobTitle}
- Industry: ${params.industry}
- Region: ${params.region}
${params.additionalContext ? `- Additional context: ${params.additionalContext}` : ''}

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
