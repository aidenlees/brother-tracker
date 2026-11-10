/**
 * Followups ("retries"), as the tracker's `followups` rules describe them (CLAUDE.md,
 * "Followups"): each item checked in the plan_checklist field named by `from` (the
 * math log's "Which problems did you struggle with?") becomes a retry with that label,
 * due defaultDueDays after the session; plan items that match listAllOpenWhen (review
 * sessions) list every open one.
 */
import { addDays, daysBetween, formatDay } from '@/lib/dates'
import type { FollowupRules } from './definition'
import type { EntryData, PlanDetails } from './entry'

type Rules = FollowupRules
type Status = 'open' | 'done' | 'dropped'

/** The retries an entry calls for: the items checked in rules.from, in order. */
export function retryLabels(rules: Rules, data: EntryData): string[] {
  const value = data[rules.from]
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

export type RetryChanges = {
  /** Labels checked with no retry yet. */
  create: string[]
  /** Retries dropped earlier whose item is checked again. */
  reopen: string[]
  /** Open retries whose item is no longer checked. */
  drop: string[]
}

/**
 * What saving an entry does to its retries, matched by label against all of the
 * entry's retries, so a retry already done is never made again.
 */
export function retryChanges(
  checked: readonly string[],
  existing: readonly { id: string; label: string; status: Status }[],
): RetryChanges {
  const labels = new Set(existing.map((f) => f.label))
  return {
    create: checked.filter((label) => !labels.has(label)),
    reopen: existing
      .filter((f) => f.status === 'dropped' && checked.includes(f.label))
      .map((f) => f.id),
    drop: existing
      .filter((f) => f.status === 'open' && !checked.includes(f.label))
      .map((f) => f.id),
  }
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

/** Where a retry stands, for Struggles: "Retry due tomorrow", "Retry overdue since Mon, Nov 9", "Retry done". */
export function retryStatus(retry: { due_date: string; status: Status }, today: string): string {
  if (retry.status === 'done') return 'Retry done'
  if (retry.status === 'dropped') return 'Retry dropped'
  return retry.due_date < today
    ? `Retry overdue since ${formatDay(retry.due_date)}`
    : `Retry ${dueLabel(retry.due_date, today)}`
}
