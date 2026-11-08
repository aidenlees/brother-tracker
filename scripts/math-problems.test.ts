// @vitest-environment node
/**
 * The problem lists in seed/math_sessions.json were read once from the printed book,
 * which stays out of the repo. These checks keep them honest when the file is rebuilt
 * or edited: every problem belongs to one session, on a page that session covers, and
 * the reviews name only problems on the lists.
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
  it('hold every problem and part in the book, 364 in all', () => {
    expect(listed).toHaveLength(364)
  })

  it('give every session problems to do', () => {
    for (const s of plan.sessions) {
      expect(s.problems?.length, `session ${String(s.session)}`).toBeGreaterThan(0)
    }
  })

  it('put each problem in one session, on a page that session covers', () => {
    expect(new Set(listed).size).toBe(listed.length)
    for (const s of working) {
      for (const label of s.problems ?? []) {
        expect(page(label), `${label} in session ${String(s.session)}`).toBeGreaterThanOrEqual(
          s.page_start ?? Infinity,
        )
        expect(page(label), `${label} in session ${String(s.session)}`).toBeLessThanOrEqual(
          s.page_end ?? 0,
        )
      }
    }
  })

  it('name review problems from the lists, as a problem or one of its parts', () => {
    for (const s of named) {
      for (const reference of s.problems ?? []) {
        expect(
          listed.some((label) => label === reference || label.startsWith(`${reference}(`)),
          `${reference} in session ${String(s.session)}`,
        ).toBe(true)
      }
    }
  })

  it('spell out the problems of each review in its description', () => {
    for (const s of named) {
      const references = [...s.assignment.matchAll(/p\. \d+ #\d+(\([a-z]\))?/g)].map((m) => m[0])
      expect(s.problems ?? [], `session ${String(s.session)}`).toEqual(references)
    }
  })
})
