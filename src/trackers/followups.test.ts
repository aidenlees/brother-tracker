import { describe, expect, it } from 'vitest'
import type { FollowupRules } from './definition'
import { defaultDue, dueLabel, listsAllOpen, retryChanges, retryLabels } from './followups'

const rules: FollowupRules = {
  from: 'struggled',
  defaultDueDays: 2,
  listAllOpenWhen: { 'plan.kind': ['review', 'mixed_check'] },
}

describe('followup rules', () => {
  it('make a retry of each problem checked as a struggle', () => {
    expect(retryLabels(rules, { struggled: ['p. 31 #4', 'p. 32 #5(b)'], minutes: 30 })).toEqual([
      'p. 31 #4',
      'p. 32 #5(b)',
    ])
    expect(retryLabels(rules, { struggled: [] })).toEqual([])
    expect(retryLabels(rules, { minutes: 30 })).toEqual([])
  })

  it('bring an entry’s retries in line with what is checked, matched by label', () => {
    const existing = [
      { id: 'r1', label: 'p. 31 #3', status: 'open' as const },
      { id: 'r2', label: 'p. 31 #4', status: 'done' as const },
      { id: 'r3', label: 'p. 32 #5', status: 'dropped' as const },
    ]
    expect(retryChanges(['p. 31 #4', 'p. 32 #5', 'p. 32 #6'], existing)).toEqual({
      create: ['p. 32 #6'], // new
      reopen: ['r3'], // dropped before, checked again
      drop: ['r1'], // open, no longer checked
    })
    // A retry already done stays done, checked or not, and is never made again.
    expect(retryChanges([], existing)).toEqual({ create: [], reopen: [], drop: ['r1'] })
    expect(retryChanges(['p. 31 #4'], [])).toEqual({ create: ['p. 31 #4'], reopen: [], drop: [] })
  })

  it('make retries due two days after the session, never before today', () => {
    expect(defaultDue(rules, '2026-11-10', '2026-11-10')).toBe('2026-11-12')
    expect(defaultDue(rules, '2026-11-01', '2026-11-10')).toBe('2026-11-10')
  })

  it('list every open retry on review and mixed-check sessions only', () => {
    expect(listsAllOpen(rules, { kind: 'review' })).toBe(true)
    expect(listsAllOpen(rules, { kind: 'mixed_check' })).toBe(true)
    expect(listsAllOpen(rules, { kind: 'practice' })).toBe(false)
    expect(listsAllOpen(rules, null)).toBe(false)
    expect(listsAllOpen({ ...rules, listAllOpenWhen: undefined }, { kind: 'review' })).toBe(false)
  })

  it('say when a retry is due in plain words', () => {
    expect(dueLabel('2026-11-10', '2026-11-10')).toBe('due today')
    expect(dueLabel('2026-11-11', '2026-11-10')).toBe('due tomorrow')
    expect(dueLabel('2026-11-09', '2026-11-10')).toBe('due yesterday')
    expect(dueLabel('2026-11-05', '2026-11-10')).toBe('due Thu, Nov 5')
  })
})
