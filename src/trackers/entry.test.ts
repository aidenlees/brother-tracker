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

const practice = {
  session: 6,
  assignment: 'Practice pp. 31-32',
  kind: 'practice',
  reading_only: false,
  problems: ['p. 31 #3', 'p. 31 #4', 'p. 32 #5', 'p. 32 #6'],
}
const reading = { session: 1, assignment: 'pp. 5-12: notes', kind: 'study', reading_only: true }
const review = { session: 21, assignment: 'Review pp. 13-35', kind: 'review', reading_only: false }

describe('initialData', () => {
  it('starts every math answer empty, with no problem checked', () => {
    expect(initialData(math, practice)).toEqual({
      completed: null,
      read: null,
      struggled: [],
      minutes: null,
    })
    expect(initialData(violin, null)).toEqual({ practiced: null, focus: '' })
  })

  it('prefills a field from the plan item when it names a plan default', () => {
    const did: FieldDefinition = {
      key: 'did',
      type: 'long_text',
      label: 'What I did',
      required: true,
      default: 'plan.assignment',
    }
    expect(initialData([did], practice).did).toBe('Practice pp. 31-32')
    expect(initialData([did], null).did).toBe('')
  })
})

describe('shownFields', () => {
  it('asks about the problems on practice days, the reading on reading days', () => {
    const keys = (plan: Record<string, unknown>) =>
      shownFields(math, initialData(math, plan), plan).map((f) => f.key)
    expect(keys(practice)).toEqual(['completed', 'struggled', 'minutes'])
    expect(keys(reading)).toEqual(['read', 'minutes'])
    // A review lists no problems: the open retries on Today are its list.
    expect(keys(review)).toEqual(['completed', 'minutes'])
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
  const reflection: FieldDefinition = {
    key: 'reflection',
    type: 'long_text',
    label: 'Reflection',
    required: false,
    rotatingPrompts: ['One', 'Two', 'Three', 'Four'],
    rotateBy: 'plan.session',
  }

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
