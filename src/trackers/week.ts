/**
 * The last 7 days on a tracker's Today card, oldest first and ending today: what each
 * day holds, so the strip can show days done, days still to log and days off. Built
 * from the tracker's data for either cadence, never from a tracker slug.
 */
import { addDays } from '@/lib/dates'
import { itemsOn, type PlanItem } from './plan'

export const WEEK_DAYS = 7

export type DayState =
  /** Logged, and it counts (a daily tracker's streak rule holds; every session that day logged). */
  | 'done'
  /** Logged, but the streak rule doesn't hold (violin: "No"). */
  | 'not-done'
  /** Still to log: a daily tracker with no entry, or a session with no entry. */
  | 'open'
  /** A plan with no session that day. */
  | 'rest'
  /** Before the assignment starts. */
  | 'before'

export type Day = {
  date: string
  state: DayState
  /** A plan's session to open from that day: the first not yet logged, else the first. */
  planItemId: string | null
}

type Logged = { date: string; plan_item_id: string | null; data: Readonly<Record<string, unknown>> }

const lastDays = (today: string) =>
  Array.from({ length: WEEK_DAYS }, (_, i) => addDays(today, i - (WEEK_DAYS - 1)))

/** A daily tracker: each day's entry, judged by the streak rule's field when there is one. */
export function dailyWeek(
  entries: readonly Logged[],
  where: unknown,
  startDate: string,
  today: string,
): Day[] {
  const counts = (entry: Logged) => (typeof where === 'string' ? entry.data[where] === true : true)
  return lastDays(today).map((date) => {
    if (date < startDate) return { date, state: 'before', planItemId: null }
    const entry = entries.find((e) => e.date === date && e.plan_item_id === null)
    const state = !entry ? 'open' : counts(entry) ? 'done' : 'not-done'
    return { date, state, planItemId: null }
  })
}

/** A plan: each day's sessions, done when every one of them has an entry. */
export function planWeek(
  items: readonly PlanItem[],
  entries: readonly Logged[],
  startDate: string,
  today: string,
): Day[] {
  const logged = new Set(entries.flatMap((e) => (e.plan_item_id ? [e.plan_item_id] : [])))
  return lastDays(today).map((date) => {
    if (date < startDate) return { date, state: 'before', planItemId: null }
    const sessions = itemsOn(items, date)
    const first = sessions[0]
    if (!first) return { date, state: 'rest', planItemId: null }
    const open = sessions.find((item) => !logged.has(item.id))
    return open
      ? { date, state: 'open', planItemId: open.id }
      : { date, state: 'done', planItemId: first.id }
  })
}

/**
 * The streak in plain words (CLAUDE.md copy rules: specific, never praise): "4 days in a
 * row." once today counts, "4 days in a row. Today makes 5." while today is still open.
 * Nothing when there's no run, or when today is logged and doesn't count.
 */
export function streakLine(run: number | null, today: DayState | undefined): string | null {
  if (!run || today === 'not-done') return null
  const sofar = run === 1 ? '1 day so far.' : `${String(run)} days in a row.`
  return today === 'done' ? sofar : `${sofar} Today makes ${String(run + 1)}.`
}
