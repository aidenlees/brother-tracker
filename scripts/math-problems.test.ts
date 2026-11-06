// @vitest-environment node
/**
 * The problem lists in seed/math_sessions.json were read once from the printed book,
 * which stays out of the repo. These checks keep them honest when the file is edited:
 * the book's own references must be on the lists, and each problem belongs to one
 * practice session, on a page that session covers.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PlanFile } from '../src/trackers/definition.ts'

const plan = PlanFile.parse(
  JSON.parse(readFileSync(new URL('../seed/math_sessions.json', import.meta.url), 'utf8')),
)
const page = (label: string) => Number(/^p\. (\d+)/.exec(label)?.[1])
const working = plan.sessions.filter((s) => s.kind === 'practice' || s.kind === 'study')
const listed = working.flatMap((s) => s.problems ?? [])
const named = plan.sessions.filter((s) => s.kind === 'review' || s.kind === 'mixed_check')

describe('math problem lists', () => {
  it('give every practice session its problems, and reading days none', () => {
    for (const s of plan.sessions) {
      if (s.kind === 'practice')
        expect(s.problems?.length, `session ${s.session}`).toBeGreaterThan(0)
      if (s.reading_only) expect(s.problems, `session ${s.session}`).toBeUndefined()
    }
  })

  it('put each problem in one session, on a page that session covers', () => {
    expect(new Set(listed).size).toBe(listed.length)
    for (const s of working) {
      for (const label of s.problems ?? []) {
        expect(page(label), `${label} in session ${s.session}`).toBeGreaterThanOrEqual(
          s.page_start ?? Infinity,
        )
        expect(page(label), `${label} in session ${s.session}`).toBeLessThanOrEqual(s.page_end ?? 0)
      }
    }
  })

  it('include every problem the plan names for review, as a problem or one of its parts', () => {
    const references = named.flatMap((s) => [...s.assignment.matchAll(/p\. \d+ #\d+(\([a-z]\))?/g)])
    expect(references).toHaveLength(20) // the 4 mixed checks and session 79
    for (const [reference] of references) {
      expect(
        listed.some((label) => label === reference || label.startsWith(`${reference}(`)),
        reference,
      ).toBe(true)
    }
  })

  it('list those named problems on their own review sessions', () => {
    for (const s of named) {
      const references = [...s.assignment.matchAll(/p\. \d+ #\d+(\([a-z]\))?/g)].map((m) => m[0])
      expect(s.problems ?? [], `session ${s.session}`).toEqual(references)
    }
  })
})
