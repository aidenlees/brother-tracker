/**
 * How long a session's work should take, worked out from the problems printed on its
 * pages (the plan's problem index, plan-edit.ts). A planning guide for the admin: the
 * math plan aims at about 45 minutes a day, and never past 60 once retries are added.
 * Never shown to the student, and never a judgement of how long they took.
 *
 * The figures come from reading the book: worked-example pages read in a few minutes,
 * lettered parts are mostly quick computations, and a problem that fills a page on its
 * own is one of the multi-step challenges.
 *
 * No imports, so `scripts/plan-math.ts` can use it as it is.
 */
export const MINUTES = {
  /** A page with no problems on it: worked examples, notes, the letter to parents. */
  readingPage: 4,
  /** A problem alone on its page (the book gives it the whole page to work in). */
  soloProblem: 9,
  /** A problem that shares its page with another. */
  sharedProblem: 5,
  /** Each lettered part ("p. 13 #1(c)"). */
  part: 1.5,
  /** Reading the question of a problem with parts, once per day it's worked on. */
  stem: 1,
} as const

type Label = { page: number; problem: number; part: string | null }

function parse(label: string): Label | null {
  const match = /^p\. (\d+) #(\d+)(?:\(([a-z])\))?$/.exec(label)
  if (!match) return null
  return { page: Number(match[1]), problem: Number(match[2]), part: match[3] ?? null }
}

/** The problem numbers printed on a page, each with its parts (empty for a whole problem). */
function problemsOn(index: ReadonlyMap<number, readonly string[]>, page: number) {
  const problems = new Map<number, string[]>()
  for (const label of index.get(page) ?? []) {
    const parsed = parse(label)
    if (!parsed) continue
    const parts = problems.get(parsed.problem) ?? []
    if (parsed.part) parts.push(parsed.part)
    problems.set(parsed.problem, parts)
  }
  return problems
}

/** One page of the book: reading if it has no problems, else the sum of its problems. */
export function pageMinutes(index: ReadonlyMap<number, readonly string[]>, page: number): number {
  const problems = problemsOn(index, page)
  if (problems.size === 0) return MINUTES.readingPage
  let minutes = 0
  for (const parts of problems.values()) {
    if (parts.length === 0) {
      minutes += problems.size === 1 ? MINUTES.soloProblem : MINUTES.sharedProblem
    } else {
      minutes += MINUTES.stem + parts.length * MINUTES.part
    }
  }
  return minutes
}

/** Printed pages start to end, in minutes. */
export function rangeMinutes(
  index: ReadonlyMap<number, readonly string[]>,
  start: number,
  end: number,
): number {
  let minutes = 0
  for (let page = start; page <= end; page += 1) minutes += pageMinutes(index, page)
  return minutes
}

/**
 * Named problems (a mixed check: "p. 17 #4(c), p. 33 #8"), each timed as it is in the
 * book. A whole problem the book prints with parts counts all of them.
 */
export function problemsMinutes(
  index: ReadonlyMap<number, readonly string[]>,
  labels: readonly string[],
): number {
  let minutes = 0
  for (const label of labels) {
    const parsed = parse(label)
    if (!parsed) continue
    const parts = problemsOn(index, parsed.page).get(parsed.problem) ?? []
    if (parsed.part) minutes += MINUTES.stem + MINUTES.part
    else if (parts.length > 0) minutes += MINUTES.stem + parts.length * MINUTES.part
    else
      minutes +=
        problemsOn(index, parsed.page).size > 1 ? MINUTES.sharedProblem : MINUTES.soloProblem
  }
  return minutes
}

const whole = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) ? value : null

/**
 * A session's estimate from its details: its pages if it has a range, else the problems
 * it names. Null when it has neither.
 */
export function sessionMinutes(
  index: ReadonlyMap<number, readonly string[]>,
  details: Readonly<Record<string, unknown>>,
): number | null {
  const start = whole(details.page_start)
  const end = whole(details.page_end) ?? start
  if (start !== null && end !== null && end >= start) return rangeMinutes(index, start, end)
  const problems = Array.isArray(details.problems)
    ? details.problems.filter((p): p is string => typeof p === 'string')
    : []
  return problems.length > 0 ? problemsMinutes(index, problems) : null
}

/** "About 45 min": rounded to 5, for a guide that shouldn't look more exact than it is. */
export function minutesLabel(minutes: number): string {
  return `About ${String(Math.max(5, Math.round(minutes / 5) * 5))} min`
}
