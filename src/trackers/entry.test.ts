// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TrackersFile, type FieldDefinition } from './definition'
import { buildEntrySchema, cleanEntry, initialData, promptFor, shownFields } from './entry'

const { trackers } = TrackersFile.parse(
  JSON.parse(readFileSync(new URL('../../seed/trackers.json', import.meta.url), 'utf8')),
)
const math = trackers.find((t) => t.slug === 'singapore-math')?.fields ?? []
const violin = trackers.find((t) => t.slug === 'violin')?.fields ?? []

const practice = { session: 6, assignment: 'Practice pp. 31-32', reading_only: false }
const reading = { session: 1, assignment: 'pp. 5-12: notes and examples', reading_only: true }

describe('initialData', () => {
  it('prefills "What I did" from the plan and starts every other field empty', () => {
    const data = initialData(math, practice)
    expect(data.did).toBe('Practice pp. 31-32')
    expect(data.checklist).toEqual({
      attempted: false,
      checked: false,
      explained: false,
      retry_planned: false,
    })
    expect(data.outcomes).toEqual({ I: 0, H: 0, S: 0, U: 0 })
    expect(data.minutes).toBeNull()
    expect(data.struggled).toBe('')
    expect(data.notebook).toBeNull()
  })

  it('leaves a plan default empty when there is no plan item', () => {
    expect(initialData(math, null).did).toBe('')
    expect(initialData(violin, null)).toEqual({ practiced: null, focus: '' })
  })
})

describe('shownFields', () => {
  it('hides the tallies on a reading-only session', () => {
    const keys = (plan: typeof practice) =>
      shownFields(math, initialData(math, plan), plan).map((f) => f.key)
    expect(keys(practice)).toContain('outcomes')
    expect(keys(reading)).not.toContain('outcomes')
  })

  it('shows the violin focus only after "yes"', () => {
    const keys = (practiced: boolean | null) =>
      shownFields(violin, { practiced, focus: '' }, null).map((f) => f.key)
    expect(keys(true)).toEqual(['practiced', 'focus'])
    expect(keys(false)).toEqual(['practiced'])
    expect(keys(null)).toEqual(['practiced'])
  })

  it('judges later conditions on the data with hidden fields removed, as SQL does', () => {
    const chain: FieldDefinition[] = [
      { key: 'a', type: 'yes_no', label: 'A', required: false, showIf: { 'plan.on': true } },
      { key: 'b', type: 'short_text', label: 'B', required: false, showIf: { a: true } },
    ]
    // a is hidden (no plan), so it's dropped before b is judged, even though a = true.
    expect(shownFields(chain, { a: true, b: 'x' }, null).map((f) => f.key)).toEqual([])
    expect(cleanEntry(chain, { a: true, b: 'x' }, null)).toEqual({ ok: true, data: {} })
  })
})

describe('cleanEntry', () => {
  it('names every problem with its field', () => {
    const result = cleanEntry(violin, { practiced: true, focus: ' ', extra: 1 }, null)
    expect(result).toEqual({
      ok: false,
      issues: [
        { key: 'focus', message: 'One specific thing you focused on is required' },
        { key: 'extra', message: 'This tracker has no field extra' },
      ],
    })
  })

  it('passes type problems through in the SQL check’s words', () => {
    const result = cleanEntry(violin, { practiced: 'yes' }, null)
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.issues[0]?.message).toBe('Did you practice today? must be yes or no')
  })

  it('works as a Zod schema too', () => {
    const schema = buildEntrySchema(violin, null)
    expect(schema.parse({ practiced: false, focus: 'x' })).toEqual({ practiced: false })
    const failed = schema.safeParse({ practiced: true })
    expect(failed.success).toBe(false)
    expect(failed.error?.issues[0]?.path).toEqual(['focus'])
  })
})

describe('promptFor', () => {
  const reflection = math.find((f) => f.key === 'reflection')
  if (!reflection) throw new Error('math has no reflection field')

  it('rotates through the prompts by session number', () => {
    const prompts = reflection.rotatingPrompts ?? []
    expect(prompts).toHaveLength(4)
    expect(promptFor(reflection, { session: 1 })).toBe(prompts[0])
    expect(promptFor(reflection, { session: 6 })).toBe(prompts[1])
    expect(promptFor(reflection, { session: 4 })).toBe(prompts[3])
    expect(promptFor(reflection, { session: 5 })).toBe(prompts[0])
  })

  it('falls back to the first prompt without a session, and to the placeholder without prompts', () => {
    expect(promptFor(reflection, null)).toBe(reflection.rotatingPrompts?.[0])
    const focus = violin.find((f) => f.key === 'focus')
    if (!focus) throw new Error('violin has no focus field')
    expect(promptFor(focus, null)).toBe(focus.placeholder)
  })
})
