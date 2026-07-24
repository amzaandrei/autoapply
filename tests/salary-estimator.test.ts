import { describe, expect, it } from 'vitest'

import { estimateSalary } from '@/lib/salary-estimator'

describe('estimateSalary', () => {
  it('returns null when the job title is empty', () => {
    expect(estimateSalary('', 'Remote')).toBeNull()
  })

  it('returns null for a role with no baseline', () => {
    expect(estimateSalary('Underwater Basket Weaver', 'Remote')).toBeNull()
  })

  it('uses an exact role baseline with the region multiplier and currency', () => {
    // software engineer 80-140 USD * 0.85 (Germany) -> 68-119, EUR symbol.
    expect(estimateSalary('Software Engineer', 'Berlin')).toBe('~€68k-119k/yr')
  })

  it('applies the Swiss multiplier and CHF currency', () => {
    // senior software engineer 120-200 USD * 1.35 -> 162-270, "CHF " prefix.
    expect(estimateSalary('Senior Software Engineer', 'Zurich')).toBe('~CHF 162k-270k/yr')
  })

  it('falls back to a 1.0 multiplier and the baseline currency for unknown regions', () => {
    // data analyst 70-120 USD, no region match -> unchanged, USD symbol.
    expect(estimateSalary('Data Analyst', 'Antarctica')).toBe('~$70k-120k/yr')
  })

  it('picks the longest keyword match when there is no exact match', () => {
    // "staff software engineer (remote)" is not an exact key; the longest
    // substring key is "staff software engineer" (180-280), not "software engineer".
    expect(estimateSalary('Staff Software Engineer (Remote)', 'Remote')).toBe('~$180k-280k/yr')
  })

  it('matches a keyword embedded in a decorated title', () => {
    // "backend developer" (80-140) is the substring match inside a longer title.
    expect(estimateSalary('Senior Backend Developer', 'Remote')).toBe('~$80k-140k/yr')
  })
})
