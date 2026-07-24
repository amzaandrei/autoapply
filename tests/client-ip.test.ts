import { describe, expect, it } from 'vitest'
import { getClientIp } from '@/lib/client-ip'

const h = (map: Record<string, string>) => new Headers(map)

describe('getClientIp', () => {
  it('uses the first hop of x-forwarded-for', () => {
    expect(getClientIp(h({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' }))).toBe('203.0.113.7')
  })

  it('trims whitespace around the first hop', () => {
    expect(getClientIp(h({ 'x-forwarded-for': '  198.51.100.9 , 10.0.0.2' }))).toBe('198.51.100.9')
  })

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    expect(getClientIp(h({ 'x-real-ip': '192.0.2.5' }))).toBe('192.0.2.5')
  })

  it('falls back to x-real-ip when x-forwarded-for is empty', () => {
    expect(getClientIp(h({ 'x-forwarded-for': '', 'x-real-ip': '192.0.2.9' }))).toBe('192.0.2.9')
  })

  it('returns "unknown" when no ip headers are present', () => {
    expect(getClientIp(h({}))).toBe('unknown')
  })

  it('returns "unknown" when headers are missing entirely', () => {
    expect(getClientIp(undefined)).toBe('unknown')
    expect(getClientIp(null)).toBe('unknown')
  })
})
