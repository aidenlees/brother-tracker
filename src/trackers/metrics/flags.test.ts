// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TrackersFile, type PacingFlag } from '../definition'
import type { PlanItem } from '../plan'
import { readMetrics, type Metric, type MetricEntry } from './engine'
import { pacingHits, type FlagContext } from './flags'

const { trackers } = TrackersFile.parse(
  JSON.parse(readFileSync(new URL('../../../seed/trackers.json', import.meta.url), 'utf8')),
)
const math = trackers.find((t) => t.slug === 'singapore-math')
if (!math) throw new Error('no math tracker')
const metrics = readMetrics(math.metrics)
const flags = math.pacingFlags ?? []
const only = (key: string): PacingFlag[] => flags.filter((f) => f.key === key)

const problems = (n: number) => Array.from({ length: n }, (_, i) => `p. 1 #${String(i + 1)}`)
const item = (date: string): PlanItem => ({
  id: `item-${date}`,
  assignment_id: 'math',
  date,
  title: 'Practice',
  details: { problems: problems(10) },
  sort: 0,
})
/** A session on its day, with this many of its 10 problems struggled with. */
const logged = (date: string, struggled: number): MetricEntry => ({
  date,
  plan_item_id: `item-${date}`,
  created_at: `${date}T20:00:00Z`,
  data: { completed: true, struggled: problems(struggled), minutes: 40 },
  plan: { problems: problems(10) },
})
const percent = (metric: Metric, value: number) =>
  metric.type === 'ratio' ? `${String(Math.round(value * 100))}%` : String(value)

// Sun Nov 8 to Sat Nov 14, seen on Thursday the 12th; the plan started Sunday Nov 1.
const context = (entries: MetricEntry[], items: PlanItem[] = [], sunday = '2026-11-08') =>
  ({
    metrics,
    entries,
    items,
    startDate: '2026-11-01',
    sunday,
    today: '2026-11-12',
    format: percent,
  }) satisfies FlagContext

describe('pacing flags', () => {
  it('reads every seeded rule against metrics the tracker has', () => {
    expect(flags.map((f) => f.key)).toEqual(['slow_down', 'trim_repetition', 'behind_plan'])
    for (const flag of flags) {
      if ('metric' in flag.when) {
        expect(metrics.map((m) => m.key)).toContain(flag.when.metric)
      }
    }
  })

  it('says slow down when a week had more struggled with than solved on my own', () => {
    // 4 + 7 of 20 struggled with: 9 of 20 on my own, 45%.
    const week = [logged('2026-11-09', 4), logged('2026-11-10', 7)]
    expect(pacingHits(only('slow_down'), context(week))).toEqual([
      { key: 'slow_down', label: 'Slow down: address the gap', detail: 'Solved on my own: 45%' },
    ])
    // Half and half isn't more.
    expect(pacingHits(only('slow_down'), context([logged('2026-11-09', 5)]))).toEqual([])
    expect(pacingHits(only('slow_down'), context([]))).toEqual([])
  })

  it('suggests trimming repetition after 3 sessions in a row at 80% or more', () => {
    const three = [logged('2026-11-08', 0), logged('2026-11-09', 1), logged('2026-11-10', 2)]
    expect(pacingHits(only('trim_repetition'), context(three))).toEqual([
      {
        key: 'trim_repetition',
        label: 'Consider trimming repetition',
        detail: 'Last 3 sessions: 100%, 90%, 80%',
      },
    ])
    // The latest at 70% breaks it; so does having only two sessions.
    expect(
      pacingHits(only('trim_repetition'), context([...three, logged('2026-11-11', 3)])),
    ).toEqual([])
    expect(pacingHits(only('trim_repetition'), context(three.slice(1)))).toEqual([])
  })

  it('skips a reading day (no problems) when looking at the last sessions', () => {
    const reading: MetricEntry = {
      ...logged('2026-11-11', 0),
      data: { read: true, minutes: 20 },
      plan: { problems: [], reading_only: true },
    }
    const sessions = [logged('2026-11-08', 0), logged('2026-11-09', 1), logged('2026-11-10', 2)]
    expect(pacingHits(only('trim_repetition'), context([...sessions, reading]))).toHaveLength(1)
  })

  it('says behind plan with 2 or more past sessions not logged, not counting today', () => {
    const items = ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'].map(item)
    expect(pacingHits(only('behind_plan'), context([logged('2026-11-08', 0)], items))).toEqual([
      {
        key: 'behind_plan',
        label: 'Behind plan',
        detail: '3 sessions not logged, Nov 9, Nov 10 and Nov 11',
      },
    ])
    // One missed isn't behind.
    const mostly = ['2026-11-08', '2026-11-09', '2026-11-10'].map((d) => logged(d, 0))
    expect(pacingHits(only('behind_plan'), context(mostly, items))).toEqual([])
  })

  it('gives a long run of missed sessions as a range', () => {
    const items = Array.from({ length: 10 }, (_, i) => item(`2026-11-0${String(i)}`)).slice(1)
    const hits = pacingHits(only('behind_plan'), context([], items))
    expect(hits[0]?.detail).toBe('9 sessions not logged, from Nov 1 to Nov 9')
  })

  it('judges a past week as it stood on its Saturday', () => {
    const items = ['2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10'].map(item)
    const hits = pacingHits(only('behind_plan'), context([], items, '2026-11-01'))
    expect(hits[0]?.detail).toBe('2 sessions not logged, Nov 5 and Nov 6')
  })
})
