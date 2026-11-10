/**
 * The metric engine (CLAUDE.md, "Metric types"): a tracker's weekly numbers, worked out
 * from its `metrics` list and the student's entries. One module for every screen (decided
 * 2026-11-09, in place of SQL views), reading each metric as data, so a tracker built
 * later gets its numbers with no new code.
 *
 * Weeks run Sunday to Saturday (New York dates). A metric with nothing to count, or a
 * zero denominator, is null: shown blank, never as 0 or NaN.
 */
import { addDays } from '@/lib/dates'
import type { MetricDefinition, PlanDetails } from '../definition'
import { countRule, whereRule } from './rules'
import { runEndingOn } from './streak'

type Answers = Readonly<Record<string, unknown>>

export type MetricEntry = {
  date: string
  plan_item_id: string | null
  created_at: string
  data: Answers
  /** Its plan item's details; null for a daily check-in. */
  plan: PlanDetails
}

type Named = { key: string; label: string }

export type Metric = Named &
  (
    | { type: 'sum' | 'avg'; field: string }
    | { type: 'count_where' | 'days_per_week' | 'streak'; where: (data: Answers) => boolean }
    | {
        type: 'ratio'
        numerator: (data: Answers, plan: PlanDetails) => number
        denominator: (data: Answers, plan: PlanDetails) => number
        percent: boolean
      }
  )

const FIELD = /^[A-Za-z][A-Za-z0-9_]*$/

/** A metric as the engine reads it, or null when its rule isn't one it can read. */
export function readMetric(definition: MetricDefinition): Metric | null {
  const { key, label, type } = definition
  const rule = definition as Readonly<Record<string, unknown>>
  switch (type) {
    case 'sum':
    case 'avg':
      return typeof rule.field === 'string' && FIELD.test(rule.field)
        ? { key, label, type, field: rule.field }
        : null
    case 'count_where':
    case 'days_per_week':
    case 'streak': {
      const where = whereRule(rule.where)
      return where ? { key, label, type, where } : null
    }
    case 'ratio': {
      const numerator = countRule(rule.numerator)
      const denominator = countRule(rule.denominator)
      return numerator && denominator
        ? { key, label, type, numerator, denominator, percent: rule.format === 'percent' }
        : null
    }
    default:
      return null
  }
}

/** Every metric of a tracker the engine can read, in the tracker's order. */
export function readMetrics(definitions: readonly MetricDefinition[]): Metric[] {
  return definitions.flatMap((d) => readMetric(d) ?? [])
}

/** The last day of the week starting `sunday` that has happened: its Saturday, or today. */
export function weekEnd(sunday: string, today: string): string {
  const saturday = addDays(sunday, 6)
  return saturday < today ? saturday : today
}

/** A metric's value for the week starting `sunday`, from all of the student's entries for it. */
export function weekValue(
  metric: Metric,
  entries: readonly MetricEntry[],
  sunday: string,
  today: string,
): number | null {
  const saturday = addDays(sunday, 6)
  const week = entries.filter((e) => e.date >= sunday && e.date <= saturday)
  switch (metric.type) {
    case 'sum':
    case 'avg': {
      const values = week
        .map((e) => e.data[metric.field])
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      if (values.length === 0) return null
      const total = values.reduce((sum, v) => sum + v, 0)
      return metric.type === 'sum' ? total : total / values.length
    }
    case 'count_where':
      return week.length === 0 ? null : week.filter((e) => metric.where(e.data)).length
    case 'days_per_week':
      return week.length === 0
        ? null
        : new Set(week.filter((e) => metric.where(e.data)).map((e) => e.date)).size
    case 'ratio': {
      // The week's sessions pooled (every problem solved on my own over every problem),
      // not an average of each day's share.
      let numerator = 0
      let denominator = 0
      for (const e of week) {
        numerator += metric.numerator(e.data, e.plan)
        denominator += metric.denominator(e.data, e.plan)
      }
      return denominator > 0 ? numerator / denominator : null
    }
    case 'streak': {
      if (sunday > today) return null
      const end = weekEnd(sunday, today)
      return runEndingOn(entries, metric.where, end, end === today)
    }
  }
}

/** A ratio metric for one entry (one session), or null when its denominator is 0. */
export function entryRatio(metric: Metric, entry: MetricEntry): number | null {
  if (metric.type !== 'ratio') return null
  const denominator = metric.denominator(entry.data, entry.plan)
  return denominator > 0 ? metric.numerator(entry.data, entry.plan) / denominator : null
}
