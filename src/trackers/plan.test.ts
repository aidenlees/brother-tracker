import { describe, expect, it } from 'vitest'
import { streak } from './metrics/streak'
import { itemsOn, missedItems, nextItem, pageLabel, sessionLabel, type PlanItem } from './plan'

const item = (id: string, date: string, details: PlanItem['details'] = {}): PlanItem => ({
  id,
  assignment_id: 'a',
  date,
  title: id,
  details,
  sort: 0,
})

describe('pageLabel', () => {
  it('adds the PDF pages beside the printed ones', () => {
    expect(pageLabel({ page_start: 31, page_end: 32, pdf_offset: 2 })).toBe('pp. 31–32 · PDF 33–34')
    expect(pageLabel({ page_start: 35, page_end: 35, pdf_offset: 2 })).toBe('p. 35 · PDF 37')
  })

  it('shows printed pages alone without an offset, and nothing without pages', () => {
    expect(pageLabel({ page_start: 5, page_end: 12 })).toBe('pp. 5–12')
    expect(pageLabel({ page_start: null, page_end: null, pdf_offset: 2 })).toBeNull()
    expect(pageLabel({})).toBeNull()
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
