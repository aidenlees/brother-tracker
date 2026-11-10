/**
 * What students have logged, for Overview (admin and viewers). RLS decides who appears:
 * the admin reads every student, a viewer only the students linked to them (rule 3,
 * select by can_see). Clearing a log is the admin's only write to entries
 * (the entries_delete policy); it goes straight to the server, since the admin works online.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isRecord } from '@/trackers/fields/contract'
import type { PlanItem } from '@/trackers/plan'
import { addDays } from './dates'
import { useOutbox } from './outbox/outbox-context'
import { parseTracker, type Tracker } from './student-data'
import { supabase } from './supabase'

/** How far back Overview lists logs: today and the 13 days before it. */
export const RECENT_DAYS = 14

export type Student = { id: string; name: string }

export type LoggedEntry = {
  id: string
  studentId: string
  date: string
  data: Record<string, unknown>
  /** What the student struggled with, as the database copies it; null for none. */
  struggled: string | null
  created_at: string
  /** Null when this version of the app can't read the tracker's definition. */
  tracker: Tracker | null
  trackerName: string
  plan: PlanItem | null
  retries: number
  comments: number
}

/** Students with an active assignment, by name. */
export function useStudents() {
  const { userId } = useOutbox()
  return useQuery({
    queryKey: [userId, 'overview', 'students'],
    queryFn: async (): Promise<Student[]> => {
      const { data, error } = await supabase
        .from('assignments')
        .select('student:profiles!assignments_student_id_fkey(id, display_name)')
        .eq('active', true)
      if (error) throw error
      const byId = new Map(data.map((row) => [row.student.id, row.student.display_name]))
      return [...byId]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name))
    },
  })
}

const count = (rows: unknown): number =>
  Array.isArray(rows) && isRecord(rows[0]) && typeof rows[0].count === 'number' ? rows[0].count : 0

/** One student's logs from the last two weeks, newest first. */
export function useRecentLogs(studentId: string | undefined, today: string) {
  const { userId } = useOutbox()
  return useQuery({
    queryKey: [userId, 'overview', 'logs', studentId, today],
    enabled: studentId !== undefined,
    // Always fresh when opened: the student may have just logged.
    staleTime: 0,
    queryFn: async (): Promise<LoggedEntry[]> => {
      const { data, error } = await supabase
        .from('entries')
        .select(
          'id, date, data, struggled, created_at, owner_id, ' +
            'assignment:assignments!inner(tracker:trackers!inner(id, slug, name, icon, color, cadence, field_version, fields, metrics, followups, display, sort, archived)), ' +
            'plan:plan_items(id, assignment_id, date, title, details, sort), ' +
            'followups(count), comments(count)',
        )
        .eq('owner_id', studentId ?? '')
        .gte('date', addDays(today, -(RECENT_DAYS - 1)))
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data as unknown as RawLog[]).map((row) => ({
        id: row.id,
        studentId: row.owner_id,
        date: row.date,
        data: isRecord(row.data) ? row.data : {},
        struggled: row.struggled || null,
        created_at: row.created_at,
        tracker: parseTracker(row.assignment.tracker),
        trackerName: row.assignment.tracker.name,
        plan: row.plan
          ? { ...row.plan, details: isRecord(row.plan.details) ? row.plan.details : {} }
          : null,
        retries: count(row.followups),
        comments: count(row.comments),
      }))
    },
  })
}

type RawLog = {
  id: string
  owner_id: string
  date: string
  data: unknown
  struggled: string | null
  created_at: string
  assignment: { tracker: { name: string } & Record<string, unknown> }
  plan: (Omit<PlanItem, 'details'> & { details: unknown }) | null
  followups: unknown
  comments: unknown
}

/** The admin clears a log: it's deleted with its retries and comments (audit_log keeps them). */
export function useClearLog() {
  const { userId } = useOutbox()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (entryId: string) => {
      const { data, error } = await supabase.from('entries').delete().eq('id', entryId).select('id')
      if (error) throw error
      if (data.length === 0) {
        throw new Error('It wasn’t cleared: only the admin can clear a log. Reload and try again.')
      }
    },
    // The plan editor's "logged" marks and anything else of the admin's read it too.
    onSuccess: () => client.invalidateQueries({ queryKey: [userId] }),
  })
}
