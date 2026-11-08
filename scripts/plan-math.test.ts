// @vitest-environment node
/**
 * The math plan's promises (scripts/plan-math-build.ts): every page of the book once, in
 * order; problems every day; six days a week; every day within 30 to 60 minutes of
 * estimated work; and the seed file is exactly what the builder makes.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PlanFile } from '../src/trackers/definition.ts'
import { problemsMinutes, rangeMinutes } from '../src/trackers/estimate.ts'
import { buildMathPlan, PLAN_OPTIONS } from './plan-math-build.ts'

const plan = PlanFile.parse(
  JSON.parse(readFileSync(new URL('../seed/math_sessions.json', import.meta.url), 'utf8')),
)
const working = plan.sessions.filter((s) => s.page_start !== null)
const checks = plan.sessions.filter((s) => s.kind === 'mixed_check')
const index = new Map<number, string[]>()
for (const s of working) {
  for (const label of s.problems ?? []) {
    const page = Number(/^p\. (\d+)/.exec(label)?.[1])
    index.set(page, [...(index.get(page) ?? []), label])
  }
}
const minutes = (s: (typeof plan.sessions)[number]) =>
  s.page_start !== null && s.page_end !== null
    ? rangeMinutes(index, s.page_start, s.page_end)
    : problemsMinutes(index, s.problems ?? [])
const dayAfter = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

describe('the math plan', () => {
  it('is exactly what pnpm plan:math builds (run it after changing the rules)', () => {
    expect(PlanFile.parse(buildMathPlan(plan))).toEqual(plan)
  })

  it('starts tomorrow and meets six days a week, every week, resting on Saturday', () => {
    expect(plan.sessions[0]?.date).toBe(PLAN_OPTIONS.start)
    for (const [i, s] of plan.sessions.entries()) {
      expect(s.weekday, `session ${String(s.session)}`).not.toBe('Sat')
      expect(s.session).toBe(i + 1)
      const next = plan.sessions[i + 1]
      if (!next) continue
      // The next session is the next day, or the day after a Saturday.
      const expected = s.weekday === 'Fri' ? dayAfter(dayAfter(s.date)) : dayAfter(s.date)
      expect(next.date, `after session ${String(s.session)}`).toBe(expected)
    }
  })

  it('covers every printed page from 5 to 309 once, in order', () => {
    const pages = working.flatMap((s) =>
      Array.from(
        { length: (s.page_end ?? 0) - (s.page_start ?? 0) + 1 },
        (_, i) => (s.page_start ?? 0) + i,
      ),
    )
    expect(pages).toEqual(Array.from({ length: 305 }, (_, i) => 5 + i))
  })

  it('gives every day problems, and between 30 and 60 minutes of work', () => {
    for (const s of plan.sessions) {
      expect(s.problems?.length, `session ${String(s.session)}`).toBeGreaterThan(0)
      expect(minutes(s), `session ${String(s.session)}`).toBeGreaterThanOrEqual(30)
      expect(minutes(s), `session ${String(s.session)}`).toBeLessThanOrEqual(60)
    }
  })

  it('has no reading-only days', () => {
    expect(plan.sessions.every((s) => !s.reading_only)).toBe(true)
  })

  it('reviews chapters 1–5, 6–10 and 11–16 with problems already done', () => {
    expect(checks.map((s) => s.topic)).toEqual([
      'Review: Chapters 1–5',
      'Review: Chapters 6–10',
      'Review: Chapters 11–16',
    ])
    for (const check of checks) {
      const before = working.filter((s) => s.date < check.date)
      const done = new Set(before.flatMap((s) => s.problems ?? []))
      for (const label of check.problems ?? []) {
        expect(
          done.has(label) || [...done].some((d) => d.startsWith(`${label}(`)),
          `${label} in ${check.topic}`,
        ).toBe(true)
      }
    }
  })
})
