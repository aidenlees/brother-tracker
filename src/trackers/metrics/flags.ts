/**
 * Pacing flags (CLAUDE.md, the math tracker): for the admin only, never shown to a
 * student or a viewer. Each is a rule in the tracker's data (definition.ts, PacingRule),
 * judged for the week shown, and says what set it off.
 */
import { addDays } from '@/lib/dates'
import type { PacingFlag } from '../definition'
import { missedItems, type PlanItem } from '../plan'
import { entryRatio, weekEnd, weekValue, type Metric, type MetricEntry } from './engine'

export type FlagHit = { key: string; label: string; detail: string }

/** "Nov 9" */
const monthDay = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(
    new Date(`${iso}T00:00:00Z`),
  )

export type FlagContext = {
  metrics: readonly Metric[]
  /** The assignment's entries and plan items. */
  entries: readonly MetricEntry[]
  items: readonly PlanItem[]
  startDate: string
  sunday: string
  today: string
  format: (metric: Metric, value: number) => string
}

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`

export function pacingHits(flags: readonly PacingFlag[], context: FlagContext): FlagHit[] {
  const { metrics, entries, items, startDate, sunday, today, format } = context
  const hit = (flag: PacingFlag): string | null => {
    const rule = flag.when
    switch (rule.type) {
      case 'week_below': {
        const metric = metrics.find((m) => m.key === rule.metric)
        const value = metric ? weekValue(metric, entries, sunday, today) : null
        return metric && value !== null && value < rule.value
          ? `${metric.label}: ${format(metric, value)}`
          : null
      }
      case 'last_sessions_at_least': {
        const metric = metrics.find((m) => m.key === rule.metric)
        if (metric?.type !== 'ratio') return null
        const end = weekEnd(sunday, today)
        const values = entries
          .filter((e) => e.plan_item_id !== null && e.date <= end)
          .toSorted(
            (a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at),
          )
          .flatMap((e) => entryRatio(metric, e) ?? [])
          .slice(-rule.sessions)
        return values.length === rule.sessions && values.every((v) => v >= rule.value)
          ? `Last ${plural(rule.sessions, 'session', 'sessions')}: ${values.map((v) => format(metric, v)).join(', ')}`
          : null
      }
      case 'missed_sessions': {
        // A session is missed once its day is over: up to yesterday, or the week's Saturday.
        const saturday = addDays(sunday, 6)
        const yesterday = addDays(today, -1)
        const cutoff = saturday < yesterday ? saturday : yesterday
        const logged = new Set(entries.flatMap((e) => e.plan_item_id ?? []))
        const missed = missedItems(items, logged, addDays(cutoff, 1))
          .filter((i) => i.date >= startDate)
          .map((i) => monthDay(i.date))
        if (missed.length < rule.atLeast) return null
        const days =
          missed.length <= 3
            ? missed.join(', ').replace(/, ([^,]+)$/, ' and $1')
            : `from ${missed[0] ?? ''} to ${missed.at(-1) ?? ''}`
        return `${plural(missed.length, 'session', 'sessions')} not logged, ${days}`
      }
    }
  }
  return flags.flatMap((flag) => {
    const detail = hit(flag)
    return detail ? [{ key: flag.key, label: flag.label, detail }] : []
  })
}
