/**
 * A student's own data: assignments with their trackers, plan items, entries and
 * followups. RLS decides what comes back; queries are keyed by the user (so caches
 * never mix people) and kept on the device (src/lib/query.ts). Entries and followups
 * include unsynced changes from the outbox.
 */
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { z } from 'zod'
import { TRACKER_ACCENTS, type TrackerAccent } from '@/theme/accents'
import { FieldDefinition, FollowupRules, MetricDefinition } from '@/trackers/definition'
import { isRecord } from '@/trackers/fields/contract'
import type { PlanItem } from '@/trackers/plan'
import { useOutbox } from './outbox/outbox-context'
import {
  overlayEntries,
  overlayFollowups,
  type EntryView,
  type FollowupView,
} from './outbox/overlay'
import { supabase } from './supabase'

const TrackerRow = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  icon: z.string(),
  color: z.string(),
  cadence: z.looseObject({ type: z.enum(['plan', 'daily']) }),
  field_version: z.number(),
  fields: z.array(FieldDefinition),
  metrics: z.array(MetricDefinition),
  followups: FollowupRules.nullable(),
  display: z.string().nullable(),
  sort: z.number(),
  archived: z.boolean(),
})
export type Tracker = Omit<z.infer<typeof TrackerRow>, 'color'> & { color: TrackerAccent }

export type Assignment = {
  id: string
  start_date: string
  /** Null when the tracker's definition can't be read by this version of the app. */
  tracker: Tracker | null
  trackerName: string
}

const accent = (color: string): TrackerAccent =>
  (TRACKER_ACCENTS as readonly string[]).includes(color) ? (color as TrackerAccent) : 'ink-blue'

/** A tracker row as this version of the app reads it, or null when it can't. */
export function parseTracker(row: unknown): Tracker | null {
  const parsed = TrackerRow.safeParse(row)
  return parsed.success ? { ...parsed.data, color: accent(parsed.data.color) } : null
}

async function fetchAssignments(userId: string): Promise<Assignment[]> {
  const { data, error } = await supabase
    .from('assignments')
    .select(
      'id, start_date, tracker:trackers!inner(id, slug, name, icon, color, cadence, field_version, fields, metrics, followups, display, sort, archived)',
    )
    .eq('student_id', userId)
    .eq('active', true)
  if (error) throw error
  return data
    .filter((row) => !row.tracker.archived)
    .sort((a, b) => a.tracker.sort - b.tracker.sort)
    .map((row) => ({
      id: row.id,
      start_date: row.start_date,
      tracker: parseTracker(row.tracker),
      trackerName: row.tracker.name,
    }))
}

export async function fetchPlanItems(assignmentIds: string[]): Promise<PlanItem[]> {
  if (assignmentIds.length === 0) return []
  const { data, error } = await supabase
    .from('plan_items')
    .select('id, assignment_id, date, title, details, sort')
    .in('assignment_id', assignmentIds)
    .order('date')
    .order('sort')
  if (error) throw error
  return data.map((row) => ({
    ...row,
    details: isRecord(row.details) ? row.details : {},
  }))
}

export async function fetchEntries(userId: string) {
  const { data, error } = await supabase
    .from('entries')
    .select('id, assignment_id, plan_item_id, field_version, date, data, created_at')
    .eq('owner_id', userId)
    .order('date')
  if (error) throw error
  return data.map((row) => ({
    ...row,
    data: isRecord(row.data) ? row.data : {},
  }))
}

async function fetchFollowups(userId: string) {
  const { data, error } = await supabase
    .from('followups')
    .select('id, entry_id, assignment_id, label, due_date, status, created_at')
    .eq('owner_id', userId)
    .order('due_date')
  if (error) throw error
  return data.map((row) => ({ ...row, status: row.status as FollowupView['status'] }))
}

export type StudentData = {
  status: 'loading' | 'error' | 'ready'
  assignments: Assignment[]
  planItems: PlanItem[]
  entries: EntryView[]
  followups: FollowupView[]
}

/** Everything the student's own screens show, with their unsynced changes on top. */
export function useStudentData(): StudentData {
  const { userId, items } = useOutbox()
  const assignments = useQuery({
    queryKey: [userId, 'assignments'],
    queryFn: () => fetchAssignments(userId),
  })
  const ids = useMemo(() => assignments.data?.map((a) => a.id) ?? [], [assignments.data])
  const planItems = useQuery({
    queryKey: [userId, 'plan-items', ids],
    queryFn: () => fetchPlanItems(ids),
    enabled: assignments.isSuccess,
  })
  const entries = useQuery({ queryKey: [userId, 'entries'], queryFn: () => fetchEntries(userId) })
  const followups = useQuery({
    queryKey: [userId, 'followups'],
    queryFn: () => fetchFollowups(userId),
  })

  return useMemo(() => {
    const queries = [assignments, planItems, entries, followups]
    const missing = queries.some((q) => q.data === undefined)
    const status = !missing ? 'ready' : queries.some((q) => q.isError) ? 'error' : 'loading'
    return {
      status,
      assignments: assignments.data ?? [],
      planItems: planItems.data ?? [],
      entries: overlayEntries(entries.data ?? [], items),
      followups: overlayFollowups(followups.data ?? [], items),
    }
  }, [assignments, planItems, entries, followups, items])
}
