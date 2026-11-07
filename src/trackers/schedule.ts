/**
 * The student's schedule, day by day (My week): each day's planned sessions and daily
 * check-ins, and where each stands. Built from the same data as Today, for any week,
 * past or coming. Weeks start on Sunday (CLAUDE.md: weeks start Sunday, New York).
 */
import { addDays } from '@/lib/dates'
import { itemsOn, type PlanItem } from './plan'

/** The Sunday that starts the week a date is in. */
export function weekStart(date: string): string {
  return addDays(date, -new Date(`${date}T00:00:00Z`).getUTCDay())
}

/** The seven dates of the week starting on that Sunday. */
export function weekDates(sunday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i))
}

export type Status =
  /** Logged (for a daily tracker with a streak rule: and it counts). */
  | 'done'
  /** A daily check-in logged, but not done (violin: "No"). */
  | 'not-done'
  /** Today, still to do. */
  | 'today'
  /** A past day with nothing logged. */
  | 'missed'
  /** A day still to come. */
  | 'coming'
  /** Before the assignment starts. */
  | 'before'

export type Row =
  | { kind: 'session'; assignmentId: string; item: PlanItem; status: Status }
  | { kind: 'daily'; assignmentId: string; date: string; status: Status }

type Logged = { date: string; plan_item_id: string | null; data: Readonly<Record<string, unknown>> }

export type ScheduleAssignment = {
  id: string
  start_date: string
  cadence: 'plan' | 'daily'
  /** A daily tracker's streak field (violin: "practiced"), if it has one. */
  doneWhen?: string
}

const timeStatus = (date: string, today: string): Status =>
  date < today ? 'missed' : date === today ? 'today' : 'coming'

/** What one day holds for one assignment, in plan order. */
export function dayRows(
  assignment: ScheduleAssignment,
  items: readonly PlanItem[],
  entries: readonly Logged[],
  date: string,
  today: string,
): Row[] {
  if (assignment.cadence === 'plan') {
    return itemsOn(items, date).map((item) => ({
      kind: 'session',
      assignmentId: assignment.id,
      item,
      status: entries.some((e) => e.plan_item_id === item.id) ? 'done' : timeStatus(date, today),
    }))
  }
  if (date < assignment.start_date) {
    return [{ kind: 'daily', assignmentId: assignment.id, date, status: 'before' }]
  }
  const entry = entries.find((e) => e.date === date && e.plan_item_id === null)
  const counts = (e: Logged) => (assignment.doneWhen ? e.data[assignment.doneWhen] === true : true)
  const status: Status = entry ? (counts(entry) ? 'done' : 'not-done') : timeStatus(date, today)
  return [{ kind: 'daily', assignmentId: assignment.id, date, status }]
}
