/**
 * The `streak` metric (CLAUDE.md, "Metric types"): days in a row, up to today, with an
 * entry where the metric's `where` rule holds (violin: "practiced"). Today not logged
 * yet doesn't break it; the streak then runs up to yesterday. Null when nothing has ever
 * counted, so the card shows nothing rather than 0.
 */
import { addDays } from '@/lib/dates'
import { whereRule } from './rules'

type Dated = { date: string; data: Readonly<Record<string, unknown>> }

export function streak(entries: readonly Dated[], where: unknown, today: string): number | null {
  const test = whereRule(where)
  return test ? runEndingOn(entries, test, today, true) : null
}

/**
 * Days in a row that count, ending on `day`. While `day` is still open (today), a day
 * with nothing yet doesn't break the run: it ends the day before. Null when no day has
 * ever counted.
 */
export function runEndingOn(
  entries: readonly Dated[],
  counts: (data: Dated['data']) => boolean,
  day: string,
  open: boolean,
): number | null {
  const days = new Set(entries.filter((e) => counts(e.data)).map((e) => e.date))
  if (days.size === 0) return null
  let at = days.has(day) || !open ? day : addDays(day, -1)
  let run = 0
  while (days.has(at)) {
    run += 1
    at = addDays(at, -1)
  }
  return run
}
