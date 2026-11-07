import { describe, expect, it } from 'vitest'
import { streak } from './metrics/streak'
import {
  itemsOn,
  missedItems,
  nextItem,
  pagesLabel,
  sessionLabel,
  topicLabel,
  workLabel,
  type PlanItem,
} from './plan'

const item = (id: string, date: string, details: PlanItem['details'] = {}): PlanItem => ({
  id,
  assignment_id: 'a',
  date,
  title: id,
  details,
  sort: 0,
})

describe('pagesLabel', () => {
  it('names the printed pages plainly', () => {
    expect(pagesLabel({ page_start: 31, page_end: 32, pdf_offset: 2 })).toBe('Pages 31–32')
    expect(pagesLabel({ page_start: 35, page_end: 35 })).toBe('Page 35')
    expect(pagesLabel({ page_start: null, page_end: null })).toBeNull()
    expect(pagesLabel({})).toBeNull()
  })
})

describe('workLabel', () => {
  it('says what to do: the pages, else the problems named, else the title', () => {
    expect(
      workLabel({ title: 'Practice pp. 31-32', details: { page_start: 31, page_end: 32 } }),
    ).toBe('Pages 31–32')
    expect(
      workLabel({
        title: 'Mixed check: p. 17 #4(c), p. 33 #8. Correct errors.',
        details: { page_start: null, problems: ['p. 17 #4(c)', 'p. 33 #8'] },
      }),
    ).toBe('p. 17 #4(c), p. 33 #8')
    expect(workLabel({ title: 'Explain 3 solutions', details: {} })).toBe('Explain 3 solutions')
  })
})

describe('topicLabel', () => {
  it('reads the topic, if the item has one', () => {
    expect(topicLabel({ topic: 'Solve by Assuming' })).toBe('Solve by Assuming')
    expect(topicLabel({ topic: ' ' })).toBeNull()
    expect(topicLabel({})).toBeNull()
  })
})

describe('sessionLabel', () => {
  it('reads the session and topic when the item has them', () => {
    expect(sessionLabel({ session: 6, topic: 'Solve by Assuming' })).toBe(
      'Session 6 · Solve by Assuming',
    )
    expect(sessionLabel({ topic: 'Scales' })).toBe('Scales')
    expect(sessionLabel({})).toBeNull()
  })
})

describe('plan items', () => {
  const items = [
    item('s1', '2026-11-08'),
    item('s2', '2026-11-10'),
    item('s3', '2026-11-12'),
    item('s4', '2026-11-14'),
  ]

  it('finds today’s item and the next one', () => {
    expect(itemsOn(items, '2026-11-10').map((i) => i.id)).toEqual(['s2'])
    expect(itemsOn(items, '2026-11-11')).toEqual([])
    expect(nextItem(items, '2026-11-10')?.id).toBe('s3')
    expect(nextItem(items, '2026-11-01')?.id).toBe('s1')
    expect(nextItem(items, '2026-11-14')).toBeNull()
  })

  it('lists past items with no entry, oldest first, never today’s', () => {
    expect(missedItems(items, new Set(['s1']), '2026-11-12').map((i) => i.id)).toEqual(['s2'])
    expect(missedItems(items, new Set(), '2026-11-08')).toEqual([])
  })
})

describe('streak', () => {
  const practiced = (date: string, yes = true) => ({ date, data: { practiced: yes } })

  it('counts days in a row ending today, or yesterday when today isn’t logged yet', () => {
    const entries = [practiced('2026-11-08'), practiced('2026-11-09'), practiced('2026-11-10')]
    expect(streak(entries, 'practiced', '2026-11-10')).toBe(3)
    expect(streak(entries, 'practiced', '2026-11-11')).toBe(3)
    expect(streak(entries, 'practiced', '2026-11-12')).toBe(0)
  })

  it('breaks on a day logged as not practiced', () => {
    const entries = [
      practiced('2026-11-08'),
      practiced('2026-11-09', false),
      practiced('2026-11-10'),
    ]
    expect(streak(entries, 'practiced', '2026-11-10')).toBe(1)
  })

  it('is blank (null) with nothing to count, or a rule it can’t read', () => {
    expect(streak([], 'practiced', '2026-11-10')).toBeNull()
    expect(streak([practiced('2026-11-10', false)], 'practiced', '2026-11-10')).toBeNull()
    expect(streak([practiced('2026-11-10')], 'all(checklist)', '2026-11-10')).toBeNull()
  })
})
