/**
 * What Overview's weekly numbers are worked out from (src/trackers/metrics): one student's
 * active trackers, their plan items and every entry. RLS decides who may read them: the
 * admin any student, a viewer only linked students. Pacing flags come with the tracker,
 * and only the admin's screen shows them.
 */
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { PacingFlag } from '@/trackers/definition'
import type { MetricEntry } from '@/trackers/metrics/engine'
import type { PlanItem } from '@/trackers/plan'
import { useOutbox } from './outbox/outbox-context'
import { fetchEntries, fetchPlanItems, parseTracker, type Tracker } from './student-data'
import { supabase } from './supabase'

export type StudentTracker = {
  assignmentId: string
  startDate: string
  tracker: Tracker | null
  trackerName: string
  flags: PacingFlag[]
  items: PlanItem[]
  entries: MetricEntry[]
}

/** Unreadable flags are left out: the numbers still show. */
const Flags = z.array(z.unknown()).transform((flags) =>
  flags.flatMap((flag) => {
    const parsed = PacingFlag.safeParse(flag)
    return parsed.success ? [parsed.data] : []
  }),
)

export function useStudentNumbers(studentId: string) {
  const { userId } = useOutbox()
  return useQuery({
    queryKey: [userId, 'overview', 'numbers', studentId],
    // Always fresh when opened: the student may have just logged.
    staleTime: 0,
    queryFn: async (): Promise<StudentTracker[]> => {
      const { data, error } = await supabase
        .from('assignments')
        .select(
          'id, start_date, tracker:trackers!inner(id, slug, name, icon, color, cadence, field_version, fields, metrics, followups, display, sort, archived, pacing_flags)',
        )
        .eq('student_id', studentId)
        .eq('active', true)
      if (error) throw error
      const assignments = data
        .filter((a) => !a.tracker.archived)
        .sort((a, b) => a.tracker.sort - b.tracker.sort)
      const [items, entries] = await Promise.all([
        fetchPlanItems(assignments.map((a) => a.id)),
        fetchEntries(studentId),
      ])
      const details = new Map(items.map((i) => [i.id, i.details]))
      return assignments.map((a) => ({
        assignmentId: a.id,
        startDate: a.start_date,
        tracker: parseTracker(a.tracker),
        trackerName: a.tracker.name,
        flags: Flags.catch([]).parse(a.tracker.pacing_flags),
        items: items.filter((i) => i.assignment_id === a.id),
        entries: entries
          .filter((e) => e.assignment_id === a.id)
          .map((e) => ({
            date: e.date,
            plan_item_id: e.plan_item_id,
            created_at: e.created_at,
            data: e.data,
            plan: e.plan_item_id ? (details.get(e.plan_item_id) ?? null) : null,
          })),
      }))
    },
  })
}
