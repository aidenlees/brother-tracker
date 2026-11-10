import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysBetween,
  formatDay,
  longDateInNewYork,
  todayInNewYork,
  weekRange,
} from './dates'

describe('longDateInNewYork', () => {
  it('names the New York day, not the UTC one', () => {
    // 23:30 EST on Wednesday Nov 4 is already Thursday in UTC.
    expect(longDateInNewYork(new Date('2026-11-05T04:30:00Z'))).toBe('Wednesday, November 4')
  })
})

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

describe('calendar dates', () => {
  it('add days across month, year and daylight-saving changes', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02')
    expect(addDays('2027-03-14', -1)).toBe('2027-03-13')
  })

  it('count the days between two dates', () => {
    expect(daysBetween('2026-11-01', '2026-11-08')).toBe(7)
    expect(daysBetween('2026-11-08', '2026-11-01')).toBe(-7)
    expect(daysBetween('2027-03-13', '2027-03-15')).toBe(2)
  })

  it('format a date as the day it names, whatever the machine’s zone', () => {
    expect(formatDay('2026-11-10')).toBe('Tue, Nov 10')
    expect(formatDay('2026-11-08', 'long')).toBe('Sunday, November 8')
  })

  it('name a week from its Sunday, across a month too', () => {
    expect(weekRange('2026-11-08')).toBe('November 8 – 14')
    expect(weekRange('2026-11-29')).toBe('November 29 – December 5')
  })
})
