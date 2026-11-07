/**
 * The plan editor's rules (admin): moving sessions while keeping the plan's weekly
 * rhythm, and the problems that go with a page range. Pure, so the screen only applies
 * what these work out (public.set_session_dates moves several sessions atomically).
 */
import { addDays } from '@/lib/dates'
import type { PlanItem } from './plan'

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()

const byDate = (a: PlanItem, b: PlanItem) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : a.sort - b.sort

/**
 * The weekdays the plan meets on: those used by more than a quarter as many sessions as
 * the busiest weekday (the math plan: Sun, Tue, Thu, Sat; its three Wednesdays are
 * one-off moves, not the rhythm).
 */
export function planWeekdays(items: readonly Pick<PlanItem, 'date'>[]): Set<number> {
  const counts = new Map<number, number>()
  for (const item of items)
    counts.set(weekday(item.date), (counts.get(weekday(item.date)) ?? 0) + 1)
  const most = Math.max(0, ...counts.values())
  return new Set([...counts].filter(([, n]) => n * 4 > most).map(([day]) => day))
}

function step(date: string, days: Set<number>, direction: 1 | -1): string {
  let next = addDays(date, direction)
  for (let i = 0; i < 7 && !days.has(weekday(next)); i += 1) next = addDays(next, direction)
  return next
}

export type Move = { id: string; date: string }

/**
 * "Move later" (direction 1, a catch-up day) or "Move earlier" (-1): this session and
 * every later one go to the next (or previous) plan day, keeping their order. Moving
 * earlier stops short of the session before: null when there's no room.
 */
export function moveSessions(
  items: readonly PlanItem[],
  fromId: string,
  direction: 1 | -1,
): Move[] | null {
  const sorted = [...items].sort(byDate)
  const from = sorted.findIndex((item) => item.id === fromId)
  if (from < 0) return null
  const days = planWeekdays(sorted)
  const moves: Move[] = []
  let previous: string | null = null
  for (const item of sorted.slice(from)) {
    let date = step(item.date, days, direction)
    if (previous !== null && date <= previous) date = step(previous, days, 1)
    moves.push({ id: item.id, date })
    previous = date
  }
  const before = sorted[from - 1]
  const first = moves[0]
  if (direction === -1 && before && first && first.date <= before.date) return null
  return moves
}

/** Every problem in the book, by the page it's printed on, from the plan's sessions. */
export function problemIndex(
  sessions: readonly { problems?: readonly string[] | undefined }[],
): Map<number, string[]> {
  const index = new Map<number, string[]>()
  for (const session of sessions) {
    for (const label of session.problems ?? []) {
      const page = Number(/^p\. (\d+) /.exec(label)?.[1])
      if (!Number.isInteger(page)) continue
      const list = index.get(page) ?? []
      if (!list.includes(label)) list.push(label)
      index.set(page, list)
    }
  }
  return index
}

/** The problems on pages start to end, in page order: a session's checkboxes. */
export function problemsFor(index: Map<number, string[]>, start: number, end: number): string[] {
  const labels: string[] = []
  for (let page = start; page <= end; page += 1) labels.push(...(index.get(page) ?? []))
  return labels
}
