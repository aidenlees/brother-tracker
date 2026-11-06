import { describe, expect, it } from 'vitest'
import type { PlanItem } from './plan'
import { dailyWeek, planWeek, streakLine } from './week'

const TODAY = '2026-11-12'

const item = (id: string, date: string): PlanItem => ({
  id,
  assignment_id: 'a',
  date,
  title: id,
  details: {},
  sort: 0,
})
const entry = (
  date: string,
  data: Record<string, unknown>,
  plan_item_id: string | null = null,
) => ({
  date,
  plan_item_id,
  data,
})

describe('dailyWeek', () => {
  it('runs 7 days, oldest first, ending today', () => {
    const days = dailyWeek([], 'practiced', '2026-11-01', TODAY)
    expect(days.map((d) => d.date)).toEqual([
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
    ])
    expect(days.every((d) => d.state === 'open')).toBe(true)
  })

  it('judges each entry by the streak rule, and marks days before the start', () => {
    const days = dailyWeek(
      [entry('2026-11-10', { practiced: true }), entry('2026-11-11', { practiced: false })],
      'practiced',
      '2026-11-08',
      TODAY,
    )
    expect(days.map((d) => d.state)).toEqual([
      'before',
      'before',
      'open',
      'open',
      'done',
      'not-done',
      'open',
    ])
  })

  it('counts any entry when the tracker keeps no streak rule, and ignores plan entries', () => {
    const days = dailyWeek(
      [entry(TODAY, { practiced: false }), entry('2026-11-11', {}, 'p1')],
      undefined,
      '2026-11-01',
      TODAY,
    )
    expect(days.at(-1)?.state).toBe('done')
    expect(days.at(-2)?.state).toBe('open')
  })
})

describe('planWeek', () => {
  const items = [
    item('s5', '2026-11-08'),
    item('s6', '2026-11-10'),
    item('s7', '2026-11-12'),
    item('s7b', '2026-11-12'),
  ]

  it('shows rest days, sessions logged and sessions still to log', () => {
    const days = planWeek(items, [entry('2026-11-09', {}, 's6')], '2026-11-01', TODAY)
    expect(days.map((d) => [d.state, d.planItemId])).toEqual([
      ['rest', null],
      ['rest', null],
      ['open', 's5'],
      ['rest', null],
      // Logged on another day, still this session's: it counts where it was planned.
      ['done', 's6'],
      ['rest', null],
      ['open', 's7'],
    ])
  })

  it('a day is done only when all its sessions are, and opens the first still to log', () => {
    const half = planWeek(items, [entry(TODAY, {}, 's7')], '2026-11-01', TODAY)
    expect(half.at(-1)).toEqual({ date: TODAY, state: 'open', planItemId: 's7b' })
    const both = planWeek(
      items,
      [entry(TODAY, {}, 's7'), entry(TODAY, {}, 's7b')],
      '2026-11-01',
      TODAY,
    )
    expect(both.at(-1)).toEqual({ date: TODAY, state: 'done', planItemId: 's7' })
  })

  it('marks days before the start, even with sessions on them', () => {
    const days = planWeek(items, [], '2026-11-10', TODAY)
    expect(days.slice(0, 4).every((d) => d.state === 'before')).toBe(true)
    expect(days[4]?.state).toBe('open')
  })
})

describe('streakLine', () => {
  it('says the run in plain words once today counts', () => {
    expect(streakLine(4, 'done')).toBe('4 days in a row.')
    expect(streakLine(1, 'done')).toBe('1 day so far.')
  })

  it('says what today adds while it is still open', () => {
    expect(streakLine(4, 'open')).toBe('4 days in a row. Today makes 5.')
    expect(streakLine(1, 'open')).toBe('1 day so far. Today makes 2.')
  })

  it('says nothing without a run, or when today is logged and does not count', () => {
    expect(streakLine(null, 'open')).toBeNull()
    expect(streakLine(0, 'open')).toBeNull()
    expect(streakLine(3, 'not-done')).toBeNull()
  })
})
