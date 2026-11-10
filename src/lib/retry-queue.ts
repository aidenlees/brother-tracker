/**
 * The Retry queue (admin): one student's open retries, a card per tracker, overdue
 * first, then due today, then coming up. Read only: only the student marks a retry
 * done or drops it (RLS, CLAUDE.md security rule 3). When a later session lists every
 * open retry (the tracker's followups.listAllOpenWhen, e.g. a mixed check), the card
 * names it, since that's when they'll be redone.
 */
import { useQuery } from '@tanstack/react-query'
import { isRecord } from '@/trackers/fields/contract'
import { listsAllOpen } from '@/trackers/followups'
import type { PlanItem } from '@/trackers/plan'
import { useOutbox } from './outbox/outbox-context'
import { parseTracker, type Tracker } from './student-data'
import { supabase } from './supabase'

export type QueuedRetry = {
  id: string
  label: string
  due_date: string
  /** The log it came from. */
  entryId: string
  entryDate: string
  plan: PlanItem | null
}

export type TrackerQueue = {
  assignmentId: string
  /** Null when this version of the app can't read the tracker's definition. */
  tracker: Tracker | null
  trackerName: string
  overdue: QueuedRetry[]
  dueToday: QueuedRetry[]
  comingUp: QueuedRetry[]
  /** The next session, today or later, that lists every open retry. */
  review: PlanItem | null
}

/** Soonest due first, then the older log, then the problem's own order (p. 7 before p. 69). */
export function byDue(a: QueuedRetry, b: QueuedRetry): number {
  if (a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1
  if (a.entryDate !== b.entryDate) return a.entryDate < b.entryDate ? -1 : 1
  return a.label.localeCompare(b.label, 'en', { numeric: true })
}

/** Overdue (due before today), due today, and coming up, each soonest first. */
export function sections(retries: readonly QueuedRetry[], today: string) {
  const sorted = [...retries].sort(byDue)
  return {
    overdue: sorted.filter((r) => r.due_date < today),
    dueToday: sorted.filter((r) => r.due_date === today),
    comingUp: sorted.filter((r) => r.due_date > today),
  }
}

/** The first plan item, today or later, on which every open retry is listed. */
export function nextReview(
  tracker: Tracker | null,
  items: readonly PlanItem[],
  today: string,
): PlanItem | null {
  const rules = tracker?.followups ?? null
  return (
    [...items]
      .filter((item) => item.date >= today && listsAllOpen(rules, item.details))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.sort - b.sort))[0] ?? null
  )
}

type RawRetry = {
  id: string
  label: string
  due_date: string
  assignment_id: string
  entry: { id: string; date: string; plan: RawPlanItem | null }
  assignment: { tracker: { name: string; sort: number } & Record<string, unknown> }
}
type RawPlanItem = Omit<PlanItem, 'details'> & { details: unknown }

const planItem = (row: RawPlanItem): PlanItem => ({
  ...row,
  details: isRecord(row.details) ? row.details : {},
})

/** The cards, in the trackers' order, from the open retries and the plan items ahead. */
export function buildQueue(
  rows: readonly RawRetry[],
  itemsAhead: readonly RawPlanItem[],
  today: string,
): TrackerQueue[] {
  const byAssignment = new Map<
    string,
    { rows: RawRetry[]; tracker: RawRetry['assignment']['tracker'] }
  >()
  for (const row of rows) {
    const group = byAssignment.get(row.assignment_id)
    if (group) group.rows.push(row)
    else byAssignment.set(row.assignment_id, { rows: [row], tracker: row.assignment.tracker })
  }
  const items = itemsAhead.map(planItem)
  return [...byAssignment]
    .sort(
      ([, a], [, b]) =>
        a.tracker.sort - b.tracker.sort || a.tracker.name.localeCompare(b.tracker.name),
    )
    .map(([assignmentId, group]) => {
      const tracker = parseTracker(group.tracker)
      const retries = group.rows.map((row): QueuedRetry => ({
        id: row.id,
        label: row.label,
        due_date: row.due_date,
        entryId: row.entry.id,
        entryDate: row.entry.date,
        plan: row.entry.plan ? planItem(row.entry.plan) : null,
      }))
      return {
        assignmentId,
        tracker,
        trackerName: group.tracker.name,
        ...sections(retries, today),
        review: nextReview(
          tracker,
          items.filter((item) => item.assignment_id === assignmentId),
          today,
        ),
      }
    })
}

export function useRetryQueue(studentId: string | undefined, today: string) {
  const { userId } = useOutbox()
  return useQuery({
    queryKey: [userId, 'retries', studentId, today],
    enabled: studentId !== undefined,
    // Always fresh when opened: the student may have just redone one.
    staleTime: 0,
    queryFn: async (): Promise<TrackerQueue[]> => {
      const { data, error } = await supabase
        .from('followups')
        .select(
          'id, label, due_date, assignment_id, ' +
            'entry:entries!inner(id, date, plan:plan_items(id, assignment_id, date, title, details, sort)), ' +
            'assignment:assignments!inner(tracker:trackers!inner(id, slug, name, icon, color, cadence, field_version, fields, metrics, followups, display, sort, archived))',
        )
        .eq('owner_id', studentId ?? '')
        .eq('status', 'open')
      if (error) throw error
      const rows = data as unknown as RawRetry[]
      const reviewed = [
        ...new Set(
          rows
            .filter((row) => isRecord(row.assignment.tracker.followups))
            .map((row) => row.assignment_id),
        ),
      ]
      if (reviewed.length === 0) return buildQueue(rows, [], today)
      const ahead = await supabase
        .from('plan_items')
        .select('id, assignment_id, date, title, details, sort')
        .in('assignment_id', reviewed)
        .gte('date', today)
      if (ahead.error) throw ahead.error
      return buildQueue(rows, ahead.data, today)
    },
  })
}
