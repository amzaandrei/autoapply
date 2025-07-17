/**
 * Verified-only contact resolver.
 *
 * The app used to generate + send emails to whatever string the AI (or the
 * user) typed in. That silently burned Gmail quota on bouncing addresses and
 * hurt deliverability.
 *
 * This resolver is the single source of truth for "should we send to this
 * company?". It combines Hunter.io's SMTP-level verifier with a cheaper DNS
 * fallback so it still behaves sensibly when Hunter is unconfigured or has
 * run out of quota.
 *
 * Results are cached on the Company row (contactEmailStatus / ..Score /
 * ..VerifiedAt) so we don't re-verify the same address every generation.
 */
import type { Company } from '@prisma/client'
import { prisma } from './prisma'
import { hunterVerifyEmail, hunterFindHiringEmail, hasHunter, type HunterVerifyStatus } from './hunter'
import { validateEmail } from './email-validator'
import { ensureCostBudget, recordCost, CostCapExceeded } from './cost-guard'

const VERIFICATION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const HUNTER_VERIFY_COST_CENTS = 1 // ~$0.01 per verification on paid plans; free tier absorbs it

export type ContactVerdict =
  | { kind: 'verified_email'; email: string; status: HunterVerifyStatus; score: number; source: 'hunter' | 'dns' | 'cache' }
  | { kind: 'risky_email'; email: string; status: HunterVerifyStatus; score: number; reason: string }
  | { kind: 'invalid_email'; email: string; reason: string }
  | { kind: 'no_email' }

/**
 * Decide whether a company's contact email is safe to send to. If the stored
 * verification is recent, reuse it; otherwise hit Hunter (or DNS fallback).
 * Writes the result back to the Company row.
 */
export async function resolveContactEmail(
  company: Pick<Company, 'id' | 'contactEmail' | 'contactEmailStatus' | 'contactEmailScore' | 'contactEmailVerifiedAt'>,
  userId?: string | null,
): Promise<ContactVerdict> {
  const email = company.contactEmail?.trim().toLowerCase()
  if (!email) return { kind: 'no_email' }

  // Reuse recent verification
  const cached = company.contactEmailVerifiedAt
  if (cached && Date.now() - new Date(cached).getTime() < VERIFICATION_TTL_MS && company.contactEmailStatus) {
    return classify(email, company.contactEmailStatus as HunterVerifyStatus, company.contactEmailScore ?? 0, 'cache')
  }

  // Fresh verification
  let status: HunterVerifyStatus = 'unknown'
  let score = 0
  let source: 'hunter' | 'dns' = 'dns'

  if (hasHunter()) {
    try {
      await ensureCostBudget('hunter', HUNTER_VERIFY_COST_CENTS)
      const result = await hunterVerifyEmail(email, userId)
      if (result) {
        await recordCost('hunter', HUNTER_VERIFY_COST_CENTS)
        status = result.status
        score = result.score
        source = 'hunter'
      }
    } catch (err) {
      if (!(err instanceof CostCapExceeded)) throw err
      // Budget exceeded — fall through to DNS so the user isn't stuck.
    }
  }

  // If Hunter is unavailable or returned an error, fall back to a cheap MX check.
  // MX-only can't confirm a mailbox exists but it rules out obviously dead domains.
  if (source === 'dns' || status === 'error') {
    const dns = await validateEmail(email)
    if (dns.valid) {
      status = 'unknown'
      score = 40 // soft confidence — MX works but no SMTP proof
    } else {
      status = 'invalid'
      score = 0
    }
  }

  // Persist on the Company row so the next call is cheap
  await prisma.company.update({
    where: { id: company.id },
    data: {
      contactEmailStatus: status,
      contactEmailScore: score,
      contactEmailVerifiedAt: new Date(),
    },
  })

  return classify(email, status, score, source)
}

function classify(email: string, status: HunterVerifyStatus, score: number, source: 'hunter' | 'dns' | 'cache'): ContactVerdict {
  switch (status) {
    case 'valid':
      return { kind: 'verified_email', email, status, score, source }
    case 'accept_all':
      // Catch-all domains accept everything at the SMTP layer — the mailbox
      // may still not exist, but it's the best signal we can get. Treat as
      // verified if Hunter's overall score is high.
      if (score >= 50) return { kind: 'verified_email', email, status, score, source }
      return { kind: 'risky_email', email, status, score, reason: 'Catch-all domain — mailbox not confirmed' }
    case 'webmail':
      // gmail.com / outlook.com etc — domain is real but Hunter can't verify
      // the specific mailbox. OK-ish to send; Gmail will bounce if it's dead.
      return { kind: 'verified_email', email, status, score, source }
    case 'invalid':
      return { kind: 'invalid_email', email, reason: 'Hunter confirmed undeliverable' }
    case 'disposable':
      return { kind: 'invalid_email', email, reason: 'Disposable / throwaway domain' }
    case 'unknown':
      if (score >= 40) return { kind: 'risky_email', email, status, score, reason: 'Unable to fully verify — domain OK but no SMTP proof' }
      return { kind: 'invalid_email', email, reason: 'Could not verify deliverability' }
    case 'error':
      return { kind: 'risky_email', email, status, score, reason: 'Verification service error — try again later' }
  }
}

/**
 * Batch-resolve a list of companies, returning the subset that are safe to
 * send to along with the verdicts for the rest (so callers can surface why a
 * company was skipped).
 */
export interface BatchResolveResult {
  sendable: Array<{ company: Company; verdict: Extract<ContactVerdict, { kind: 'verified_email' }> }>
  skipped: Array<{ company: Company; verdict: Exclude<ContactVerdict, { kind: 'verified_email' }> }>
}

/**
 * Verify an email address without touching the DB. Used by the discovery
 * flow, where companies aren't yet persisted and we want to decide whether
 * to present them to the user at all.
 */
export async function verifyTransientEmail(email: string, userId?: string | null): Promise<ContactVerdict> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return { kind: 'no_email' }

  let status: HunterVerifyStatus = 'unknown'
  let score = 0
  let source: 'hunter' | 'dns' = 'dns'

  if (hasHunter()) {
    try {
      await ensureCostBudget('hunter', HUNTER_VERIFY_COST_CENTS)
      const result = await hunterVerifyEmail(normalized, userId)
      if (result) {
        await recordCost('hunter', HUNTER_VERIFY_COST_CENTS)
        status = result.status
        score = result.score
        source = 'hunter'
      }
    } catch (err) {
      if (!(err instanceof CostCapExceeded)) throw err
      // Budget exceeded — fall through to DNS.
    }
  }

  if (source === 'dns' || status === 'error') {
    const dns = await validateEmail(normalized)
    if (dns.valid) {
      status = 'unknown'
      score = 40
    } else {
      status = 'invalid'
      score = 0
    }
  }

  return classify(normalized, status, score, source)
}

/**
 * For discovery: given a company (possibly without an email), try Hunter's
 * domain/company search to fill one in, then SMTP-verify it. Returns null if
 * we can't produce a verified_email — i.e. the company shouldn't be shown to
 * the user as a sendable target.
 */
export interface DiscoveryVerification {
  email: string
  status: HunterVerifyStatus
  score: number
  resolvedDomain: string | null
}

export async function findAndVerifyForDiscovery(input: {
  companyName: string
  domain?: string | null
  existingEmail?: string | null
  userId?: string | null
}): Promise<DiscoveryVerification | null> {
  let email = input.existingEmail?.trim() || null
  let domain = input.domain ?? null

  // If the AI/jobs source didn't give us an email, ask Hunter. Hunter can
  // resolve a company name to its domain server-side, so no AI call is needed.
  if (!email && hasHunter()) {
    const found = await hunterFindHiringEmail({ domain, companyName: input.companyName, userId: input.userId })
    if (found) {
      email = found.email
      domain = found.domain ?? domain
    }
  }

  if (!email) return null

  const verdict = await verifyTransientEmail(email, input.userId)
  if (verdict.kind !== 'verified_email') return null

  return {
    email: verdict.email,
    status: verdict.status,
    score: verdict.score,
    resolvedDomain: domain,
  }
}

export async function resolveContactEmailsBatch(companies: Company[], userId?: string | null): Promise<BatchResolveResult> {
  const sendable: BatchResolveResult['sendable'] = []
  const skipped: BatchResolveResult['skipped'] = []

  // Sequential on purpose — Hunter has a low rate limit and we don't want to
  // blow the daily budget by firing 100 verifications in parallel.
  for (const company of companies) {
    const verdict = await resolveContactEmail(company, userId)
    if (verdict.kind === 'verified_email') {
      sendable.push({ company, verdict })
    } else {
      skipped.push({ company, verdict })
    }
  }

  return { sendable, skipped }
}
