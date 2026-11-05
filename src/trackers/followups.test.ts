import { describe, expect, it } from 'vitest'
import type { FollowupRules } from './definition'
import { defaultDue, dueLabel, listsAllOpen, retryCount, retryFields } from './followups'

const rules: FollowupRules = {
  enabledFrom: ['outcomes.H', 'outcomes.S', 'outcomes.U'],
  labelHint: 'p. 31 #4',
  defaultDueDays: 2,
  listAllOpenWhen: { 'plan.kind': ['review', 'mixed_check'] },
}

describe('followup rules', () => {
  it('count the problems that call for a retry', () => {
    expect(retryFields(rules)).toEqual(new Set(['outcomes']))
    expect(retryCount(rules, { outcomes: { I: 5, H: 2, S: 1, U: 0 } })).toBe(3)
    expect(retryCount(rules, { outcomes: { I: 5 } })).toBe(0)
    expect(retryCount(rules, {})).toBe(0)
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
