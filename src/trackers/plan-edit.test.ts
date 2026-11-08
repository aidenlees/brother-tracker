import { describe, expect, it } from 'vitest'
import { dayOffMoves, moveSessions, planWeekdays, problemIndex, problemsFor } from './plan-edit'
import type { PlanItem } from './plan'

const item = (id: string, date: string, sort = 0): PlanItem => ({
  id,
  assignment_id: 'a',
  date,
  title: id,
  details: {},
  sort,
})

// Sun Nov 8, Tue 10, Thu 12, Sat 14, Sun 15, Tue 17: the math rhythm.
const plan = [
  item('s1', '2026-11-08'),
  item('s2', '2026-11-10'),
  item('s3', '2026-11-12'),
  item('s4', '2026-11-14'),
  item('s5', '2026-11-15'),
  item('s6', '2026-11-17'),
]

describe('planWeekdays', () => {
  it('finds the weekdays the plan meets on, ignoring one-off moves', () => {
    const withWednesday = [...plan, item('s7', '2026-11-18'), item('s8', '2026-11-19')]
    expect([...planWeekdays(plan)].sort()).toEqual([0, 2, 4, 6])
    // One Wednesday among many Sun/Tue/Thu/Sat sessions is a one-off.
    const many = [...plan, ...plan.map((p, i) => item(`x${i}`, p.date)), ...withWednesday]
    expect(planWeekdays(many).has(3)).toBe(false)
  })
})

describe('moveSessions', () => {
  it('moves a session and every later one to the next plan day (a catch-up day)', () => {
    expect(moveSessions(plan, 's3', 1)).toEqual([
      { id: 's3', date: '2026-11-14' },
      { id: 's4', date: '2026-11-15' },
      { id: 's5', date: '2026-11-17' },
      { id: 's6', date: '2026-11-19' },
    ])
  })

  it('moves them back to the previous plan day when there is room', () => {
    const later = plan.map((p) => {
      const move = moveSessions(plan, 's3', 1)?.find((m) => m.id === p.id)
      return move ? { ...p, date: move.date } : p
    })
    expect(moveSessions(later, 's3', -1)).toEqual([
      { id: 's3', date: '2026-11-12' },
      { id: 's4', date: '2026-11-14' },
      { id: 's5', date: '2026-11-15' },
      { id: 's6', date: '2026-11-17' },
    ])
  })

  it('refuses to move earlier onto the session before', () => {
    expect(moveSessions(plan, 's3', -1)).toBeNull()
  })

  it('keeps sessions in order across a one-off day', () => {
    // Four weeks of Sun/Tue/Thu/Sat from Nov 8, plus a one-off Wednesday (Nov 11).
    const weeks = Array.from({ length: 4 }, (_, w) =>
      [0, 2, 4, 6].map((d) => {
        const date = new Date(Date.UTC(2026, 10, 8 + w * 7 + d)).toISOString().slice(0, 10)
        return item(`w${w}d${d}`, date)
      }),
    ).flat()
    const withWednesday = [...weeks, item('wed', '2026-11-11')]
    const moves = moveSessions(withWednesday, 'w0d2', 1) ?? []
    // Tue Nov 10 -> Thu 12; the Wednesday -> Sat 14 (after Thu); Thu 12 -> Sun 15; …
    expect(moves.slice(0, 4)).toEqual([
      { id: 'w0d2', date: '2026-11-12' },
      { id: 'wed', date: '2026-11-14' },
      { id: 'w0d4', date: '2026-11-15' },
      { id: 'w0d6', date: '2026-11-17' },
    ])
    const dates = moves.map((m) => m.date)
    expect([...dates].sort()).toEqual(dates)
    expect(new Set(dates).size).toBe(dates.length)
  })
})

describe('problems for a page range', () => {
  const index = problemIndex([
    { problems: ['p. 30 #1', 'p. 30 #2'] },
    { problems: ['p. 31 #3', 'p. 31 #4', 'p. 32 #5(a)', 'p. 32 #5(b)'] },
    { problems: ['p. 17 #4(c)', 'p. 30 #2'] }, // a mixed check names problems again
  ])

  it('lists each page’s problems once, in page order', () => {
    expect(index.get(30)).toEqual(['p. 30 #1', 'p. 30 #2'])
    expect(problemsFor(index, 30, 32)).toEqual([
      'p. 30 #1',
      'p. 30 #2',
      'p. 31 #3',
      'p. 31 #4',
      'p. 32 #5(a)',
      'p. 32 #5(b)',
    ])
    expect(problemsFor(index, 33, 34)).toEqual([])
  })
})

describe('dayOffMoves', () => {
  // Sunday to Friday, resting on Saturday: the six-day plan.
  const six = [
    item('d1', '2026-11-12'), // Thu
    item('d2', '2026-11-13'), // Fri
    item('d3', '2026-11-15'), // Sun
    item('d4', '2026-11-16'), // Mon
    item('d5', '2026-11-17'), // Tue
    item('d6', '2026-11-18'), // Wed
    item('d7', '2026-11-19'), // Thu
  ]

  it('moves that day’s session and every later one to the next plan day, skipping the rest day', () => {
    expect(dayOffMoves(six, '2026-11-13')).toEqual([
      { id: 'd2', date: '2026-11-15' },
      { id: 'd3', date: '2026-11-16' },
      { id: 'd4', date: '2026-11-17' },
      { id: 'd5', date: '2026-11-18' },
      { id: 'd6', date: '2026-11-19' },
      { id: 'd7', date: '2026-11-20' },
    ])
  })

  it('moves nothing on a day with nothing planned', () => {
    expect(dayOffMoves(six, '2026-11-14')).toBeNull()
  })
})
