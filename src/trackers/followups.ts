/**
 * Followups ("retries"), as the tracker's `followups` rules describe them (CLAUDE.md,
 * "Followups"): offered after the fields named in enabledFrom when any of those counts
 * is above zero, due defaultDueDays after the session, and all listed on plan items
 * that match listAllOpenWhen (review sessions).
 */
import { addDays, daysBetween, formatDay } from '@/lib/dates'
import type { FollowupRules } from './definition'
import type { EntryData, PlanDetails } from './entry'

type Rules = FollowupRules

/** "outcomes.H" -> ["outcomes", "H"] */
const split = (ref: string): [string, string | undefined] => {
  const [field, option] = ref.split('.')
  return [field ?? ref, option]
}

/** The fields whose answers can call for a retry (e.g. the tally of outcomes). */
export function retryFields(rules: Rules): Set<string> {
  return new Set(rules.enabledFrom.map((ref) => split(ref)[0]))
}

/** How many problems call for a retry: H + S + U, for the launch math tracker. */
export function retryCount(rules: Rules, data: EntryData): number {
  return rules.enabledFrom.reduce((sum, ref) => {
    const [field, option] = split(ref)
    const value =
      option === undefined
        ? data[field]
        : (data[field] as Record<string, unknown> | undefined)?.[option]
    return sum + (typeof value === 'number' && value > 0 ? value : 0)
  }, 0)
}

/**
 * Due defaultDueDays after the session, but never before today: a session logged late
 * shouldn't arrive with its retries already overdue.
 */
export function defaultDue(rules: Rules, sessionDate: string, today: string): string {
  const due = addDays(sessionDate, rules.defaultDueDays)
  return due < today ? today : due
}

/** True on plan items where every open retry is listed, not just the due ones. */
export function listsAllOpen(rules: Rules | null, details: PlanDetails): boolean {
  const when = rules?.listAllOpenWhen
  if (!when || !details) return false
  return Object.entries(when).every(([ref, values]) => {
    const value = details[ref.replace(/^plan\./, '')]
    return values.some((v) => v === value)
  })
}

/** "due today", "due tomorrow", "due yesterday", or "due Tue, Nov 10". */
export function dueLabel(due: string, today: string): string {
  const days = daysBetween(today, due)
  if (days === 0) return 'due today'
  if (days === 1) return 'due tomorrow'
  if (days === -1) return 'due yesterday'
  return `due ${formatDay(due)}`
}
