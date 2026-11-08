/**
 * Builds the math plan behind `pnpm plan:math` (seed/math_sessions.json): every printed
 * page of the book in order, six days a week, with problems to do every day.
 *
 *   * Each chapter is split into days whose estimated work (src/trackers/estimate.ts)
 *     comes as close as it can to the target and stays within the bounds. A day never
 *     crosses a chapter and never splits a problem; the chapter's worked examples go
 *     with its first problems, so no day is reading alone.
 *   * After chapters 5, 10 and 16 comes a mixed check: earlier problems to redo, named
 *     one by one, about a day's work. Problems the plan already named for review come
 *     first; the rest are taken from the end of each chapter, chapter by chapter.
 *
 * Its input is the plan file itself (the problem lists read once from the book, the
 * chapters, the problems named for review), so building from its own output changes
 * nothing. Pure: the script reads and writes the file.
 */
import type { PlanFile, PlanSession } from '../src/trackers/definition.ts'
import { pageMinutes, problemsMinutes } from '../src/trackers/estimate.ts'

export type PlanOptions = {
  /** The first day of work (a Sunday: weeks start on Sunday). */
  start: string
  /** Weekdays with no math. */
  restDays: readonly PlanSession['weekday'][]
  /** Minutes of new work a day to aim for, and the bounds every day stays within. */
  target: number
  min: number
  max: number
  /** A mixed check follows each of these chapters (1-based), over the chapters since the last one. */
  reviewAfter: readonly number[]
}

export const PLAN_OPTIONS: PlanOptions = {
  start: '2026-11-08',
  restDays: ['Sat'],
  target: 45,
  min: 30,
  max: 55,
  reviewAfter: [5, 10, 16],
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const LABEL = /^p\. (\d+) #(\d+)(?:\(([a-z])\))?$/

type Chapter = { number: number; title: string; pages: number[] }
type Day = { chapter: Chapter; pages: number[] }

const pageOf = (label: string) => Number(LABEL.exec(label)?.[1])
const problemOf = (label: string) => label.replace(/\([a-z]\)$/, '')
const partOf = (label: string) => LABEL.exec(label)?.[3] ?? null

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? 'Sun'

const range = (pages: readonly number[]) => {
  const first = pages[0] ?? 0
  const last = pages[pages.length - 1] ?? first
  return first === last ? `p. ${String(first)}` : `pp. ${String(first)}–${String(last)}`
}

/** A session that works through pages of the book (not a review of earlier ones). */
const works = (s: PlanSession) => s.kind === 'study' || s.kind === 'practice'

/** Every problem label, by the page it's printed on, from the sessions that work pages. */
function problemIndex(plan: PlanFile): Map<number, string[]> {
  const index = new Map<number, string[]>()
  for (const s of plan.sessions) {
    if (!works(s)) continue
    for (const label of s.problems ?? []) {
      const list = index.get(pageOf(label)) ?? []
      if (!list.includes(label)) list.push(label)
      index.set(pageOf(label), list)
    }
  }
  return index
}

/** The chapters in page order, from the sessions that work pages ("Angles and Triangles: practice" is chapter 16). */
function chapters(plan: PlanFile): Chapter[] {
  const list: Chapter[] = []
  for (const s of plan.sessions) {
    if (!works(s) || s.page_start === null || s.page_end === null) continue
    const title = (s.topic.split(':')[0] ?? s.topic).trim()
    let chapter = list[list.length - 1]
    if (!chapter || chapter.title !== title) {
      chapter = { number: list.length + 1, title, pages: [] }
      list.push(chapter)
    }
    for (let page = s.page_start; page <= s.page_end; page += 1) {
      if (!chapter.pages.includes(page)) chapter.pages.push(page)
    }
  }
  for (const chapter of list) chapter.pages.sort((a, b) => a - b)
  return list
}

/**
 * A chapter's pages in the smallest pieces a day can be cut into: each ends on a page
 * with problems, and the examples ride with the first problems. With `keepParts`, a
 * problem whose parts run onto the next page keeps that page too.
 */
function units(chapter: Chapter, index: Map<number, string[]>, keepParts: boolean): number[][] {
  const pieces: number[][] = []
  let current: number[] = []
  for (const page of chapter.pages) {
    current.push(page)
    if ((index.get(page) ?? []).length > 0) {
      pieces.push(current)
      current = []
    }
  }
  const last = pieces[pieces.length - 1]
  if (current.length > 0) {
    if (last) last.push(...current)
    else pieces.push(current)
  }
  // A page that opens with a later part of the previous page's problem stays with it.
  const merged: number[][] = []
  for (const piece of pieces) {
    const first = index.get(piece.find((p) => (index.get(p) ?? []).length > 0) ?? -1)?.[0]
    const before = merged[merged.length - 1]
    const previous = before ? index.get(before[before.length - 1] ?? -1) : undefined
    const prevLast = previous?.[previous.length - 1]
    const continues =
      first !== undefined &&
      prevLast !== undefined &&
      partOf(first) !== null &&
      partOf(first) !== 'a' &&
      problemOf(first).replace(/^p\. \d+ /, '') === problemOf(prevLast).replace(/^p\. \d+ /, '')
    if (before && continues && keepParts) before.push(...piece)
    else merged.push([...piece])
  }
  return merged
}

/**
 * Cuts the pieces into days, in order: the number of days and the cuts whose days come
 * closest to the target, with every day within the bounds.
 */
function split(pieces: number[][], minutes: number[], options: PlanOptions): number[][][] {
  const total = minutes.reduce((a, b) => a + b, 0)
  const sums = [0]
  for (const m of minutes) sums.push((sums[sums.length - 1] ?? 0) + m)
  const sum = (i: number, j: number) => (sums[j] ?? 0) - (sums[i] ?? 0)
  let best: { cost: number; cuts: number[] } | null = null
  const guess = Math.max(1, Math.round(total / options.target))
  for (let days = Math.max(1, guess - 2); days <= Math.min(pieces.length, guess + 2); days += 1) {
    // cost[k][i]: the best cost of cutting pieces i.. into k days, and where the next cut is.
    const memo = new Map<string, { cost: number; cuts: number[] }>()
    const solve = (i: number, k: number): { cost: number; cuts: number[] } => {
      const key = `${String(i)},${String(k)}`
      const known = memo.get(key)
      if (known) return known
      let result = { cost: Infinity, cuts: [] as number[] }
      if (k === 0) {
        result = i === pieces.length ? { cost: 0, cuts: [] } : result
      } else {
        for (let j = i + 1; j <= pieces.length - k + 1; j += 1) {
          const m = sum(i, j)
          if (m < options.min || m > options.max) continue
          const rest = solve(j, k - 1)
          const cost = (m - options.target) ** 2 + rest.cost
          if (cost < result.cost) result = { cost, cuts: [j, ...rest.cuts] }
        }
      }
      memo.set(key, result)
      return result
    }
    const found = solve(0, days)
    if (found.cost < (best?.cost ?? Infinity)) best = found
  }
  if (!best)
    throw new Error(
      `No way to split pages ${String(pieces[0]?.[0])}–${String(pieces.at(-1)?.at(-1))} into days of ${String(options.min)}–${String(options.max)} min: ${minutes.join(', ')}`,
    )
  const days: number[][][] = []
  let from = 0
  for (const cut of best.cuts) {
    days.push(pieces.slice(from, cut))
    from = cut
  }
  return days
}

function splitChapter(pieces: number[][], index: Map<number, string[]>, options: PlanOptions) {
  const minutes = pieces.map((piece) => piece.reduce((m, p) => m + pageMinutes(index, p), 0))
  return split(pieces, minutes, options)
}

/** The problems to redo in a mixed check over these chapters: about a day's work. */
function mixedCheck(
  block: Chapter[],
  index: Map<number, string[]>,
  named: readonly string[],
  options: PlanOptions,
): string[] {
  const inBlock = (label: string) => block.some((c) => c.pages.includes(pageOf(label)))
  const chosen = [...new Set(named.filter(inBlock))]
  const taken = (label: string) =>
    chosen.some((c) => c === label || c === problemOf(label) || problemOf(c) === label)
  let minutes = problemsMinutes(index, chosen)
  // From the end of each chapter (its hardest problems), one chapter at a time.
  const queues = block.map((c) => c.pages.flatMap((page) => index.get(page) ?? []).reverse())
  while (minutes < options.target - 5 && queues.some((q) => q.length > 0)) {
    for (const queue of queues) {
      let label = queue.shift()
      while (label !== undefined && taken(label)) label = queue.shift()
      if (label === undefined) continue
      const more = problemsMinutes(index, [label])
      if (minutes + more > options.max) continue
      chosen.push(label)
      minutes += more
      if (minutes >= options.target - 5) break
    }
  }
  return chosen
}

export function buildMathPlan(plan: PlanFile, options: PlanOptions = PLAN_OPTIONS): PlanFile {
  const index = problemIndex(plan)
  const book = chapters(plan)
  const named = plan.sessions
    .filter((s) => s.kind === 'review' || s.kind === 'mixed_check')
    .flatMap((s) => s.problems ?? [])

  // The work, in order: chapters cut into days, a mixed check after each block.
  type Work = { kind: 'pages'; day: Day } | { kind: 'check'; block: Chapter[] }
  const work: Work[] = []
  let blockStart = 0
  for (const chapter of book) {
    // Keep a problem's parts on one day when the days still fit; Chapter 1's long runs
    // of quick computations can't, and a page of them stands on its own anyway.
    let days: number[][][]
    try {
      days = splitChapter(units(chapter, index, true), index, options)
    } catch {
      days = splitChapter(units(chapter, index, false), index, options)
    }
    for (const day of days) work.push({ kind: 'pages', day: { chapter, pages: day.flat() } })
    if (options.reviewAfter.includes(chapter.number)) {
      work.push({ kind: 'check', block: book.slice(blockStart, chapter.number) })
      blockStart = chapter.number
    }
  }

  let date = options.start
  const sessions: PlanSession[] = work.map((item, i) => {
    while (options.restDays.includes(weekdayOf(date))) date = addDays(date, 1)
    const day = date
    date = addDays(date, 1)
    const common = {
      session: i + 1,
      week:
        Math.floor(
          (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${options.start}T00:00:00Z`)) / (7 * 864e5),
        ) + 1,
      date: day,
      weekday: weekdayOf(day),
      reading_only: false,
    }
    if (item.kind === 'check') {
      const first = item.block[0]?.number ?? 1
      const last = item.block[item.block.length - 1]?.number ?? first
      const problems = mixedCheck(item.block, index, named, options)
      return {
        ...common,
        topic: `Review: Chapters ${String(first)}–${String(last)}`,
        assignment: `Mixed check: redo ${problems.join(', ')} without looking back. Correct any errors.`,
        page_start: null,
        page_end: null,
        kind: 'mixed_check' as const,
        problems,
      }
    }
    const { chapter, pages } = item.day
    const problems = pages.flatMap((p) => index.get(p) ?? [])
    const reading = pages.slice(
      0,
      pages.findIndex((p) => (index.get(p) ?? []).length > 0),
    )
    const practice = pages.slice(reading.length)
    const study = pages[0] === chapter.pages[0]
    return {
      ...common,
      topic: chapter.title,
      assignment:
        study && reading.length > 0
          ? `Read ${range(reading)}, then do the problems on ${range(practice)}.`
          : `Do the problems on ${range(pages)}.`,
      page_start: pages[0] ?? null,
      page_end: pages[pages.length - 1] ?? null,
      kind: study ? ('study' as const) : ('practice' as const),
      ...(problems.length > 0 ? { problems } : {}),
    }
  })

  return {
    tracker: plan.tracker,
    source: `Every printed page in order, ${String(7 - options.restDays.length)} days a week, about ${String(options.target)} minutes a day (scripts/plan-math-build.ts; estimates in src/trackers/estimate.ts)`,
    ...(plan.page_note ? { page_note: plan.page_note } : {}),
    ...(plan.pdf_offset !== undefined ? { pdf_offset: plan.pdf_offset } : {}),
    sessions,
  }
}
