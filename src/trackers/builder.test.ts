// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  blankDraft,
  draftFrom,
  keyFrom,
  move,
  newQuestion,
  questionTypes,
  optionsFrom,
  removeQuestion,
  slugFrom,
  suggestMetrics,
  toDefinition,
  type Draft,
} from './builder'
import { TrackersFile } from './definition'
import { FIELD_REGISTRY } from './fields/registry'

const seed = TrackersFile.parse(
  JSON.parse(readFileSync(new URL('../../seed/trackers.json', import.meta.url), 'utf8')),
)
const tracker = (slug: string) => {
  const t = seed.trackers.find((x) => x.slug === slug)
  if (!t) throw new Error(slug)
  return { ...t, id: `id-${slug}` }
}

describe('tracker builder', () => {
  it('makes links and keys from names', () => {
    expect(slugFrom('Reading Log!')).toBe('reading-log')
    expect(slugFrom('  Piano — scales ')).toBe('piano-scales')
    expect(keyFrom('Pages read?', [])).toBe('pages_read')
    expect(keyFrom('Pages read?', ['pages_read', 'pages_read_2'])).toBe('pages_read_3')
    expect(keyFrom('3 things', [])).toBe('things')
    expect(keyFrom('???', [])).toBe('question')
  })

  it('starts a blank with the default questions, which publish as they are', () => {
    const draft = blankDraft('Reading', 3)
    expect(draft.fields.map((f) => f.key)).toEqual(['did', 'struggled'])
    const result = toDefinition(draft, 1)
    expect(result.ok).toBe(true)
  })

  it('copies a tracker without what belongs to its plan', () => {
    const copy = draftFrom(tracker('singapore-math'), { name: 'Science', sort: 9 })
    expect(copy.id).toBeNull()
    expect(copy.slug).toBe('science')
    expect(copy.cadence).toEqual({ type: 'daily' })
    // The plan's problem checklist and plan-only conditions are gone.
    expect(copy.fields.map((f) => f.type)).not.toContain('plan_checklist')
    expect(
      copy.fields.every(
        (f) => !f.showIf || !Object.keys(f.showIf).some((k) => k.startsWith('plan.')),
      ),
    ).toBe(true)
    expect(copy.followups).toBeUndefined()
    expect(copy.pacingFlags).toBeUndefined()
    expect(toDefinition(copy, 1).ok).toBe(true)
  })

  it('edits a tracker keeping its saved keys', () => {
    const edit = draftFrom(tracker('violin'))
    expect(edit.id).toBe('id-violin')
    expect(edit.savedKeys).toEqual(['practiced', 'focus'])
  })

  it('adds questions with unique keys, and choices from lines', () => {
    const draft = blankDraft('Reading', 3)
    const q = newQuestion('select', 'How did it go?', draft)
    expect(q.key).toBe('how_did_it_go')
    expect(q.options?.length).toBe(2)
    expect(newQuestion('photo', 'Photo', draft).required).toBe(false)
    expect(optionsFrom('Easy\n\n Hard \nEasy')).toEqual([
      { key: 'easy', label: 'Easy' },
      { key: 'hard', label: 'Hard' },
      { key: 'easy_2', label: 'Easy' },
    ])
  })

  it('moves a question, and ignores a move off either end', () => {
    expect(move(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(move(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(move(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
  })

  it('removes a question with the conditions and numbers that leaned on it', () => {
    const violin = draftFrom(tracker('violin'))
    const without = removeQuestion(violin, 'practiced')
    expect(without.fields.map((f) => f.key)).toEqual(['focus'])
    expect(without.fields[0]?.showIf).toBeUndefined()
    expect(without.metrics).toEqual([])
  })

  it('suggests weekly numbers from the questions, not ones it already has', () => {
    const draft: Draft = { ...blankDraft('Piano', 4), fields: [] }
    draft.fields.push(newQuestion('yes_no', 'Practiced?', draft))
    draft.fields.push(newQuestion('duration', 'Minutes', draft))
    draft.fields.push(newQuestion('rating_1_5', 'How it felt', draft))
    const suggestions = suggestMetrics(draft)
    expect(suggestions.map((s) => [s.metric.type, s.metric.label])).toEqual([
      ['days_per_week', 'Days'],
      ['streak', 'Streak'],
      ['sum', 'Minutes'],
      ['avg', 'Average how it felt'],
    ])
    const first = suggestions[0]?.metric
    if (!first) throw new Error('no suggestion')
    const withDays = { ...draft, metrics: [first] }
    expect(suggestMetrics(withDays).map((s) => s.metric.type)).not.toContain('days_per_week')
    // Every suggestion is a rule the metric engine reads.
    expect(toDefinition({ ...draft, metrics: suggestions.map((s) => s.metric) }, 1).ok).toBe(true)
  })

  it('says what stops a draft from publishing', () => {
    const draft = blankDraft('', 1)
    draft.fields = [{ key: 'q', type: 'select', label: '', required: true, options: [] }]
    const result = toDefinition(draft, 1)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.map((i) => i.message)).toEqual([
      'Give the tracker a name.',
      'The name needs at least one letter or digit.',
      'Write the question.',
      'List at least one choice.',
    ])
  })

  it('offers only question types the app can render and the database can check', () => {
    const draft = blankDraft('All', 1)
    for (const type of Object.keys(FIELD_REGISTRY)) {
      if (type === 'plan_checklist' || type === 'tally_group') continue
      draft.fields.push(newQuestion(type as never, `A ${type}`, draft))
    }
    expect(toDefinition(draft, 1).ok).toBe(true)
  })
})

describe('a tracker on a plan', () => {
  const planDraft = (): Draft => ({ ...blankDraft('Reading', 5), cadence: { type: 'plan' } })

  it('can ask about the session’s problems, which a daily tracker can’t', () => {
    expect(questionTypes(blankDraft('Daily', 1)).map((t) => t.type)).not.toContain('plan_checklist')
    const draft = planDraft()
    expect(questionTypes(draft).map((t) => t.type)).toContain('plan_checklist')
    const q = newQuestion('plan_checklist', 'Which were hard?', draft)
    expect(q).toEqual({
      key: 'which_were_hard',
      type: 'plan_checklist',
      label: 'Which were hard?',
      required: false,
      optionsFrom: 'plan.problems',
    })
  })

  it('suggests "solved on my own" from the problems, and publishes with retries', () => {
    const draft = planDraft()
    draft.fields.push(newQuestion('plan_checklist', 'Which were hard?', draft))
    const rate = suggestMetrics(draft).find((s) => s.metric.type === 'ratio')?.metric
    expect(rate).toMatchObject({
      numerator: 'count(plan.problems) - count(which_were_hard)',
      denominator: 'count(plan.problems)',
      format: 'percent',
    })
    if (!rate) return
    const withRetries: Draft = {
      ...draft,
      metrics: [rate],
      followups: { from: 'which_were_hard', defaultDueDays: 2 },
    }
    expect(toDefinition(withRetries, 1).ok).toBe(true)
    // Removing the checklist takes its retries and its number with it.
    const without = removeQuestion(withRetries, 'which_were_hard')
    expect(without.followups).toBeUndefined()
    expect(without.metrics).toEqual([])
  })
})
