// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TrackersFile, type MetricDefinition, type PlanDetails } from '../definition'
import { entryRatio, readMetric, readMetrics, weekValue, type MetricEntry } from './engine'
import { countRule, whereRule } from './rules'

const { trackers } = TrackersFile.parse(
  JSON.parse(readFileSync(new URL('../../../seed/trackers.json', import.meta.url), 'utf8')),
)
const seeded = (slug: string) => trackers.find((t) => t.slug === slug)?.metrics ?? []
const metric = (slug: string, key: string) => {
  const found = readMetrics(seeded(slug)).find((m) => m.key === key)
  if (!found) throw new Error(`no ${slug} metric ${key}`)
  return found
}

const problems = (n: number) => Array.from({ length: n }, (_, i) => `p. 1 #${String(i + 1)}`)
const session = (
  date: string,
  data: Record<string, unknown>,
  plan: PlanDetails = { problems: problems(10) },
): MetricEntry => ({
  date,
  plan_item_id: `item-${date}`,
  created_at: `${date}T20:00:00Z`,
  data,
  plan,
})
const daily = (date: string, data: Record<string, unknown>): MetricEntry => ({
  date,
  plan_item_id: null,
  created_at: `${date}T20:00:00Z`,
  data,
  plan: null,
})

// The week of Sun Nov 8 to Sat Nov 14, seen on Thursday the 12th.
const SUNDAY = '2026-11-08'
const TODAY = '2026-11-12'
const LAST_WEEK = '2026-11-01'

describe('the rules metrics are written in', () => {
  it('reads a where rule: one field, or several joined by "or"', () => {
    const rule = whereRule('completed or read')
    expect(rule?.({ completed: true })).toBe(true)
    expect(rule?.({ read: true })).toBe(true)
    expect(rule?.({ completed: false, read: false })).toBe(false)
    expect(rule?.({ completed: 'yes' })).toBe(false)
    expect(whereRule('practiced')?.({ practiced: true })).toBe(true)
  })

  it('refuses a where rule it can’t read', () => {
    for (const bad of ['completed and read', 'completed or', '', 'a.b', 3, undefined]) {
      expect(whereRule(bad)).toBeNull()
    }
  })

  it('reads a count rule from the answers and the plan item', () => {
    const rule = countRule('count(plan.problems) - count(struggled) + 1')
    expect(rule?.({ struggled: ['a', 'b'] }, { problems: problems(5) })).toBe(4)
    // A list that isn't there counts 0, and so does a daily entry's missing plan.
    expect(rule?.({}, null)).toBe(1)
  })

  it('refuses a count rule it can’t read', () => {
    for (const bad of ['count(problems) * 2', 'count(plan.problems', '- 1', 'sum(minutes)', null]) {
      expect(countRule(bad)).toBeNull()
    }
  })

  it('reads every metric seeded for the launch trackers', () => {
    for (const tracker of trackers) {
      expect(readMetrics(tracker.metrics), tracker.slug).toHaveLength(tracker.metrics.length)
    }
  })

  it('leaves out a metric it can’t read, so it shows blank', () => {
    const typo: MetricDefinition = { key: 'm', type: 'sum', label: 'Minutes', field: 'min utes' }
    expect(readMetric(typo)).toBeNull()
  })
})

describe('a math week (sessions, minutes, solved on my own)', () => {
  const entries = [
    session(SUNDAY, { completed: true, struggled: problems(2), minutes: 40 }),
    session(
      '2026-11-09',
      { completed: true, struggled: problems(4), minutes: 50 },
      { problems: problems(8) },
    ),
    // A reading day: no problems, so it counts as done but adds nothing to the share.
    session('2026-11-10', { read: true, minutes: 20 }, { problems: [], reading_only: true }),
    session(
      '2026-11-05',
      { completed: true, struggled: [], minutes: 30 },
      { problems: problems(5) },
    ),
  ]
  const value = (key: string, sunday = SUNDAY) =>
    weekValue(metric('singapore-math', key), entries, sunday, TODAY)

  it('counts the sessions done, completed or read', () => {
    expect(value('completed_week')).toBe(3)
    expect(value('completed_week', LAST_WEEK)).toBe(1)
  })

  it('adds up the minutes', () => {
    expect(value('minutes_week')).toBe(110)
    expect(value('minutes_week', LAST_WEEK)).toBe(30)
  })

  it('pools the week’s problems for the share solved on my own', () => {
    // (8 + 4 + 0) solved on my own out of (10 + 8 + 0).
    expect(value('independent_rate')).toBeCloseTo(12 / 18)
    expect(value('independent_rate', LAST_WEEK)).toBe(1)
  })

  it('is blank for a week with nothing logged, never 0', () => {
    for (const key of ['completed_week', 'minutes_week', 'independent_rate']) {
      expect(value(key, '2026-10-25')).toBeNull()
    }
  })

  it('is blank for the share when the week had no problems', () => {
    expect(
      weekValue(
        metric('singapore-math', 'independent_rate'),
        [entries[2] as MetricEntry],
        SUNDAY,
        TODAY,
      ),
    ).toBeNull()
  })

  it('gives one session’s share, blank on a reading day', () => {
    const rate = metric('singapore-math', 'independent_rate')
    expect(entryRatio(rate, entries[0] as MetricEntry)).toBe(0.8)
    expect(entryRatio(rate, entries[2] as MetricEntry)).toBeNull()
  })

  it('keeps Saturday in its week and Sunday in the next', () => {
    const edges = [
      session('2026-11-14', { completed: true, minutes: 15 }),
      session('2026-11-15', { completed: true, minutes: 25 }),
    ]
    const minutes = metric('singapore-math', 'minutes_week')
    expect(weekValue(minutes, edges, SUNDAY, '2026-11-20')).toBe(15)
    expect(weekValue(minutes, edges, '2026-11-15', '2026-11-20')).toBe(25)
  })
})

describe('a violin week (practice days, streak)', () => {
  const entries = [
    daily('2026-11-06', { practiced: true, focus: 'shifts' }),
    daily('2026-11-07', { practiced: true, focus: 'bowing' }),
    daily(SUNDAY, { practiced: true, focus: 'scales' }),
    daily('2026-11-09', { practiced: true, focus: 'shifts' }),
    daily('2026-11-10', { practiced: false }),
    daily('2026-11-11', { practiced: true, focus: 'vibrato' }),
  ]
  const value = (key: string, sunday = SUNDAY) =>
    weekValue(metric('violin', key), entries, sunday, TODAY)

  it('counts the days practiced, not the days logged', () => {
    expect(value('days_week')).toBe(3)
    expect(value('days_week', LAST_WEEK)).toBe(2)
  })

  it('gives this week’s streak up to today, which isn’t logged yet', () => {
    expect(value('streak')).toBe(1)
  })

  it('gives a past week’s streak as it stood on its Saturday', () => {
    expect(value('streak', LAST_WEEK)).toBe(2)
  })

  it('is blank for a week still to come', () => {
    expect(value('streak', '2026-11-15')).toBeNull()
    expect(value('days_week', '2026-11-15')).toBeNull()
  })
})

describe('sums and averages', () => {
  const minutes = (type: 'sum' | 'avg') => {
    const read = readMetric({ key: 'm', type, label: 'Minutes', field: 'minutes' })
    if (!read) throw new Error('unread')
    return read
  }
  const entries = [
    daily(SUNDAY, { minutes: 20 }),
    daily('2026-11-09', { minutes: 25 }),
    daily('2026-11-10', { minutes: 'n/a' }),
  ]

  it('average the numbers given, skipping answers that aren’t numbers', () => {
    expect(weekValue(minutes('sum'), entries, SUNDAY, TODAY)).toBe(45)
    expect(weekValue(minutes('avg'), entries, SUNDAY, TODAY)).toBe(22.5)
  })

  it('are blank with no number to count', () => {
    expect(weekValue(minutes('avg'), [daily(SUNDAY, {})], SUNDAY, TODAY)).toBeNull()
  })
})
