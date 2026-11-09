import { describe, expect, it } from 'vitest'
import type { PlanItem } from './plan'
import { MAX_REPEATS, taskDates, taskDay, taskNotes, taskSeries } from './tasks'

const item = (id: string, date: string, extra: Partial<PlanItem> = {}): PlanItem => ({
  id,
  assignment_id: 'tasks',
  date,
  title: `Task ${id}`,
  details: {},
  sort: 0,
  ...extra,
})

describe('taskDates', () => {
  it('is one date for a task that doesn’t repeat', () => {
    expect(taskDates('2026-11-09', { kind: 'none' })).toEqual(['2026-11-09'])
  })

  it('repeats every day up to and including the last date', () => {
    expect(taskDates('2026-11-09', { kind: 'daily', until: '2026-11-11' })).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
    ])
  })

  it('repeats on the chosen weekdays only', () => {
    // Mon 9th to Sun 22nd, on Mondays and Thursdays.
    expect(
      taskDates('2026-11-09', { kind: 'weekdays', days: [1, 4], until: '2026-11-22' }),
    ).toEqual(['2026-11-09', '2026-11-12', '2026-11-16', '2026-11-19'])
  })

  it('makes nothing when the last date is before the first, and refuses too many', () => {
    expect(taskDates('2026-11-09', { kind: 'daily', until: '2026-11-08' })).toEqual([])
    expect(taskDates('2026-11-09', { kind: 'daily', until: '2027-11-09' })).toBeNull()
    const most = taskDates('2026-11-01', { kind: 'daily', until: '2027-02-08' })
    expect(most).toHaveLength(MAX_REPEATS)
  })
})

describe('taskDay', () => {
  const today = '2026-11-10'
  const items = [
    item('a', '2026-11-08'),
    item('b', '2026-11-09'),
    item('c', '2026-11-09'),
    item('d', today, { sort: 2 }),
    item('e', today, { sort: 1 }),
    item('f', '2026-11-12'),
    item('g', '2026-11-11'),
  ]
  const entries = [
    { id: 'eb', date: '2026-11-09', plan_item_id: 'b' }, // done on its day
    { id: 'ec', date: today, plan_item_id: 'c' }, // done late, today
    { id: 'ed', date: today, plan_item_id: 'd' },
    { id: 'eg', date: today, plan_item_id: 'g' }, // done early
  ]

  it('lists today’s tasks in order, done or not', () => {
    const day = taskDay(items, entries, today)
    expect(day.today.map((r) => [r.item.id, r.entry?.id])).toEqual([
      ['e', undefined],
      ['d', 'ed'],
    ])
  })

  it('keeps an earlier task until it’s done, and one done today so it can be unticked', () => {
    expect(taskDay(items, entries, today).earlier.map((r) => r.item.id)).toEqual(['a', 'c'])
  })

  it('says what’s next, skipping a task already done early', () => {
    expect(taskDay(items, entries, today).next?.id).toBe('f')
    expect(taskDay(items.slice(0, 5), entries, today).next).toBeNull()
  })
})

describe('task details', () => {
  it('reads the notes and the series, ignoring blanks', () => {
    expect(taskNotes({ notes: '  Bring the book. ' })).toBe('Bring the book.')
    expect(taskNotes({ notes: '  ' })).toBeNull()
    expect(taskNotes({})).toBeNull()
    expect(taskSeries({ series: 's1' })).toBe('s1')
    expect(taskSeries({})).toBeNull()
  })
})
