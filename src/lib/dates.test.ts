import { describe, expect, it } from 'vitest'
import { todayInNewYork } from './dates'

describe('todayInNewYork', () => {
  it('stays on the evening date when UTC has already rolled over', () => {
    // 23:30 EST on Nov 4 is 04:30 UTC on Nov 5.
    expect(todayInNewYork(new Date('2026-11-05T04:30:00Z'))).toBe('2026-11-04')
  })

  it('handles the hour before the fall-back change (EDT, UTC-4)', () => {
    // 01:30 EDT on Nov 1, 2026; clocks fall back at 06:00 UTC.
    expect(todayInNewYork(new Date('2026-11-01T05:30:00Z'))).toBe('2026-11-01')
    // 23:59 EDT on Oct 31.
    expect(todayInNewYork(new Date('2026-11-01T03:59:00Z'))).toBe('2026-10-31')
  })

  it('handles the spring-forward change (EST to EDT)', () => {
    // 23:59 EDT on Mar 14, 2027 is 03:59 UTC on Mar 15.
    expect(todayInNewYork(new Date('2027-03-15T03:59:00Z'))).toBe('2027-03-14')
    // Midnight EDT on Mar 15.
    expect(todayInNewYork(new Date('2027-03-15T04:00:00Z'))).toBe('2027-03-15')
  })

  it('pads month and day', () => {
    expect(todayInNewYork(new Date('2027-01-05T17:00:00Z'))).toBe('2027-01-05')
  })
})
