/**
 * The `streak` metric (CLAUDE.md, "Metric types"): days in a row, up to today, with an
 * entry where the metric's `where` field is true (violin: "practiced"). Today not logged
 * yet doesn't break it; the streak then runs up to yesterday. Null when nothing has ever
 * counted, so the card shows nothing rather than 0.
 */
import { addDays } from '@/lib/dates'

type Dated = { date: string; data: Readonly<Record<string, unknown>> }

/** `where` names a field that must be true. Anything else isn't a rule this engine reads. */
function counts(where: unknown): ((data: Dated['data']) => boolean) | null {
  if (typeof where !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(where)) return null
  return (data) => data[where] === true
}

export function streak(entries: readonly Dated[], where: unknown, today: string): number | null {
  const test = counts(where)
  if (!test) return null
  const days = new Set(entries.filter((e) => test(e.data)).map((e) => e.date))
  if (days.size === 0) return null
  let day = days.has(today) ? today : addDays(today, -1)
  let run = 0
  while (days.has(day)) {
    run += 1
    day = addDays(day, -1)
  }
  return run
}
