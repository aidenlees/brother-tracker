import { describe, expect, it } from 'vitest'
import type { PlanItem } from './plan'
import { dayRows, weekDates, weekStart } from './schedule'

const item = (id: string, date: string): PlanItem => ({
  id,
  assignment_id: 'math',
  date,
  title: id,
  details: {},
  sort: 0,
})
const math = { id: 'math', start_date: '2026-11-08', cadence: 'plan' as const }
const violin = {
  id: 'violin',
  start_date: '2026-11-08',
  cadence: 'daily' as const,
  doneWhen: 'practiced',
}
const TODAY = '2026-11-10'

describe('weeks', () => {
  it('start on the Sunday before (or on) a date', () => {
    expect(weekStart('2026-11-08')).toBe('2026-11-08') // a Sunday
    expect(weekStart('2026-11-14')).toBe('2026-11-08') // the Saturday after
    expect(weekStart('2026-11-01')).toBe('2026-11-01')
    expect(weekStart('2027-01-01')).toBe('2026-12-27') // across the year
  })

  it('run seven days from that Sunday', () => {
    expect(weekDates('2026-11-08')).toEqual([
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
    ])
  })
})

describe('dayRows', () => {
  const items = [item('s1', '2026-11-08'), item('s2', '2026-11-10'), item('s3', '2026-11-12')]
  const logged = [{ date: '2026-11-08', plan_item_id: 's1', data: {} }]

  it('marks sessions done, missed, today or coming', () => {
    const status = (date: string) => dayRows(math, items, logged, date, TODAY).map((r) => r.status)
    expect(status('2026-11-08')).toEqual(['done'])
    expect(status('2026-11-10')).toEqual(['today'])
    expect(status('2026-11-12')).toEqual(['coming'])
    expect(status('2026-11-09')).toEqual([]) // no session that day
  })

  it('a session logged late still counts as done on its own day', () => {
    const late = [{ date: '2026-11-11', plan_item_id: 's2', data: {} }]
    expect(dayRows(math, items, late, '2026-11-10', '2026-11-11')[0]?.status).toBe('done')
  })

  it('marks daily check-ins by their streak field, and days before the start', () => {
    const entries = [
      { date: '2026-11-08', plan_item_id: null, data: { practiced: true } },
      { date: '2026-11-09', plan_item_id: null, data: { practiced: false } },
    ]
    const status = (date: string) => dayRows(violin, [], entries, date, TODAY)[0]?.status
    expect(status('2026-11-07')).toBe('before')
    expect(status('2026-11-08')).toBe('done')
    expect(status('2026-11-09')).toBe('not-done')
    expect(status('2026-11-10')).toBe('today')
    expect(status('2026-11-11')).toBe('coming')
    expect(
      dayRows({ ...violin, start_date: '2026-11-01' }, [], [], '2026-11-02', TODAY)[0]?.status,
    ).toBe('missed')
  })
})
