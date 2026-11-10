import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

const { buildQueue, byDue, nextReview, sections } = await import('./retry-queue')

const TODAY = '2026-11-10'

const retry = (label: string, due: string, entryDate = '2026-11-07') => ({
  id: label,
  label,
  due_date: due,
  entryId: `entry-${entryDate}`,
  entryDate,
  plan: null,
})

const tracker = (over: Record<string, unknown> = {}) => ({
  id: 't-math',
  slug: 'math',
  name: 'Math',
  icon: 'book',
  color: 'ink-blue',
  cadence: { type: 'plan' },
  field_version: 1,
  fields: [],
  metrics: [],
  followups: {
    from: 'struggled',
    defaultDueDays: 2,
    listAllOpenWhen: { 'plan.kind': ['review', 'mixed_check'] },
  },
  display: null,
  sort: 1,
  archived: false,
  ...over,
})

const item = (id: string, date: string, details: Record<string, unknown>, sort = 0) => ({
  id,
  assignment_id: 'a-math',
  date,
  title: id,
  details,
  sort,
})

const row = (label: string, due: string, over: Record<string, unknown> = {}) => ({
  id: label,
  label,
  due_date: due,
  assignment_id: 'a-math',
  entry: { id: 'e1', date: '2026-11-07', plan: item('s12', '2026-11-07', { session: 12 }) },
  assignment: { tracker: tracker() },
  ...over,
})

describe('retry queue', () => {
  it('puts overdue first, then due today, then coming up, each soonest first', () => {
    const { overdue, dueToday, comingUp } = sections(
      [
        retry('p. 70 #13', '2026-11-11'),
        retry('p. 69 #11', '2026-11-09'),
        retry('p. 30 #2', TODAY),
        retry('p. 12 #1', '2026-11-02'),
        retry('p. 80 #1', '2026-11-20'),
      ],
      TODAY,
    )
    expect(overdue.map((r) => r.label)).toEqual(['p. 12 #1', 'p. 69 #11'])
    expect(dueToday.map((r) => r.label)).toEqual(['p. 30 #2'])
    expect(comingUp.map((r) => r.label)).toEqual(['p. 70 #13', 'p. 80 #1'])
  })

  it('breaks a tie on the due day by the older log, then the problem’s order', () => {
    const list = [
      retry('p. 69 #11', TODAY, '2026-11-08'),
      retry('p. 7 #2(b)', TODAY, '2026-11-08'),
      retry('p. 7 #2(a)', TODAY, '2026-11-08'),
      retry('p. 90 #1', TODAY, '2026-11-06'),
    ].sort(byDue)
    expect(list.map((r) => r.label)).toEqual(['p. 90 #1', 'p. 7 #2(a)', 'p. 7 #2(b)', 'p. 69 #11'])
  })

  it('finds the next session, today or later, that lists every open retry', () => {
    const items = [
      item('past', '2026-11-08', { kind: 'mixed_check' }),
      item('practice', '2026-11-12', { kind: 'practice' }),
      item('later', '2026-12-14', { kind: 'mixed_check' }),
      item('soon', '2026-11-22', { kind: 'mixed_check' }),
    ]
    const math = buildQueue([row('p. 1 #1', TODAY)], [], TODAY)[0]?.tracker ?? null
    expect(nextReview(math, items, TODAY)?.id).toBe('soon')
    expect(nextReview(math, [item('today', TODAY, { kind: 'review' })], TODAY)?.id).toBe('today')
    expect(nextReview(math, items.slice(0, 2), TODAY)).toBeNull()
    expect(nextReview(null, items, TODAY)).toBeNull()
  })

  it('makes one card per tracker, in the trackers’ order, with its review session', () => {
    const violin = tracker({ id: 't-violin', name: 'Violin', sort: 0, followups: null })
    const cards = buildQueue(
      [
        row('p. 69 #11', '2026-11-09'),
        row('scales', '2026-11-12', { assignment_id: 'a-violin', assignment: { tracker: violin } }),
        row('p. 70 #13', '2026-11-11'),
      ],
      [item('s13', '2026-11-22', { kind: 'mixed_check', session: 13 })],
      TODAY,
    )
    expect(cards.map((c) => c.trackerName)).toEqual(['Violin', 'Math'])
    const [violinCard, math] = cards
    expect(math?.overdue.map((r) => r.label)).toEqual(['p. 69 #11'])
    expect(math?.comingUp.map((r) => r.label)).toEqual(['p. 70 #13'])
    expect(math?.overdue[0]?.plan?.details).toEqual({ session: 12 })
    expect(math?.review?.id).toBe('s13')
    expect(violinCard?.review).toBeNull()
  })

  it('keeps a card whose tracker this version can’t read, by its name', () => {
    const [card] = buildQueue(
      [row('p. 1 #1', TODAY, { assignment: { tracker: { name: 'Future', sort: 0 } } })],
      [],
      TODAY,
    )
    expect(card?.tracker).toBeNull()
    expect(card?.trackerName).toBe('Future')
    expect(card?.dueToday).toHaveLength(1)
    expect(card?.review).toBeNull()
  })

  it('has no cards with nothing open', () => {
    expect(buildQueue([], [], TODAY)).toEqual([])
  })
})
