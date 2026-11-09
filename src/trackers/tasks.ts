/**
 * Tasks (a tracker with display: task_list): plan items the admin adds one by one, each
 * ticked off on Today. A task is an item; ticking it off logs an entry for it, dated the
 * day it was done. Nothing here names a tracker: any task_list tracker works this way.
 */
import { addDays } from '@/lib/dates'
import type { PlanItem } from './plan'

/** The most dates one repeating task may make, so a slip of the "until" date can't make hundreds. */
export const MAX_REPEATS = 100

export type Repeat =
  | { kind: 'none' }
  | { kind: 'daily'; until: string }
  /** 0 = Sunday … 6 = Saturday. */
  | { kind: 'weekdays'; days: readonly number[]; until: string }

const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay()

/**
 * The dates a task falls on: its first date, then (repeating) every day or each chosen
 * weekday up to and including `until`. Null when there are more than MAX_REPEATS.
 */
export function taskDates(first: string, repeat: Repeat): string[] | null {
  if (repeat.kind === 'none') return [first]
  const dates: string[] = []
  for (let date = first; date <= repeat.until; date = addDays(date, 1)) {
    if (repeat.kind === 'daily' || repeat.days.includes(weekday(date))) dates.push(date)
    if (dates.length > MAX_REPEATS) return null
  }
  return dates
}

/** The admin's note on a task, if any. */
export function taskNotes(details: PlanItem['details']): string | null {
  const notes = details.notes
  return typeof notes === 'string' && notes.trim() ? notes.trim() : null
}

/** A task's series: the id shared by every date of one repeating task. */
export function taskSeries(details: PlanItem['details']): string | null {
  return typeof details.series === 'string' ? details.series : null
}

type Logged = { id: string; date: string; plan_item_id: string | null }

export type TaskRow<E extends Logged = Logged> = { item: PlanItem; entry: E | undefined }

export type TaskDay<E extends Logged = Logged> = {
  /** Dated today, done or not. */
  today: TaskRow<E>[]
  /** From earlier days and not done, oldest first; with any ticked off today, so they can be unticked. */
  earlier: TaskRow<E>[]
  /** The next task still to come. */
  next: PlanItem | null
}

const byDate = (a: PlanItem, b: PlanItem) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : a.sort - b.sort || a.title.localeCompare(b.title)

/** What Today shows of a student's tasks. A task stays until it's done (or the admin deletes it). */
export function taskDay<E extends Logged>(
  items: readonly PlanItem[],
  entries: readonly E[],
  today: string,
): TaskDay<E> {
  const entryFor = (item: PlanItem) => entries.find((e) => e.plan_item_id === item.id)
  const rows = [...items].sort(byDate).map((item) => ({ item, entry: entryFor(item) }))
  return {
    today: rows.filter((r) => r.item.date === today),
    earlier: rows.filter(
      (r) => r.item.date < today && (r.entry === undefined || r.entry.date === today),
    ),
    next: rows.find((r) => r.item.date > today && r.entry === undefined)?.item ?? null,
  }
}
