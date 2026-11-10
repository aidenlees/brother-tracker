/**
 * Struggles (admin, viewers): one student's logs that name something they struggled
 * with, newest first, each with its retries and comments. It reads entries.struggled,
 * which the database copies from the answer (CLAUDE.md, data model), so any tracker
 * with a `struggled` field shows here. RLS decides which students a viewer sees.
 */
import { useQuery } from '@tanstack/react-query'
import { isRecord } from '@/trackers/fields/contract'
import type { PlanItem } from '@/trackers/plan'
import { COMMENT_COLUMNS, parseComments, type Comment } from './comments'
import { useOutbox } from './outbox/outbox-context'
import { parseTracker, type Tracker } from './student-data'
import { supabase } from './supabase'

export type Retry = {
  id: string
  label: string
  due_date: string
  status: 'open' | 'done' | 'dropped'
}

export type Struggle = {
  id: string
  date: string
  /** The checked problems, in order; empty when the answer is free text. */
  problems: string[]
  /** The answer as written, for a tracker whose struggled field is free text. */
  text: string
  tracker: Tracker | null
  trackerName: string
  plan: PlanItem | null
  retries: Retry[]
  comments: Comment[]
}

const STATUSES = new Set(['open', 'done', 'dropped'])

function parseRetries(rows: unknown): Retry[] {
  return (Array.isArray(rows) ? rows : []).filter(
    (r): r is Retry =>
      isRecord(r) &&
      typeof r.id === 'string' &&
      typeof r.label === 'string' &&
      typeof r.due_date === 'string' &&
      typeof r.status === 'string' &&
      STATUSES.has(r.status),
  )
}

/** Has the log a retry still open? The "Still open" filter. */
export const hasOpenRetry = (s: Struggle) => s.retries.some((r) => r.status === 'open')

export function useStruggles(studentId: string | undefined) {
  const { userId } = useOutbox()
  return useQuery({
    // Under 'comments', so posting one refreshes this list.
    queryKey: [userId, 'comments', 'struggles', studentId],
    enabled: studentId !== undefined,
    staleTime: 0,
    queryFn: async (): Promise<Struggle[]> => {
      const { data, error } = await supabase
        .from('entries')
        .select(
          'id, date, created_at, data, struggled, ' +
            'assignment:assignments!inner(tracker:trackers!inner(id, slug, name, icon, color, cadence, field_version, fields, metrics, followups, display, sort, archived)), ' +
            'plan:plan_items(id, assignment_id, date, title, details, sort), ' +
            `followups(id, label, due_date, status), comments(${COMMENT_COLUMNS})`,
        )
        .eq('owner_id', studentId ?? '')
        .not('struggled', 'is', null)
        .neq('struggled', '')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data as unknown as RawStruggle[]).map((row) => {
        const answer = isRecord(row.data) ? row.data.struggled : undefined
        return {
          id: row.id,
          date: row.date,
          problems: Array.isArray(answer)
            ? answer.filter((p): p is string => typeof p === 'string')
            : [],
          text: Array.isArray(answer) ? '' : row.struggled,
          tracker: parseTracker(row.assignment.tracker),
          trackerName: row.assignment.tracker.name,
          plan: row.plan
            ? { ...row.plan, details: isRecord(row.plan.details) ? row.plan.details : {} }
            : null,
          retries: parseRetries(row.followups),
          comments: parseComments(row.comments),
        }
      })
    },
  })
}

type RawStruggle = {
  id: string
  date: string
  data: unknown
  struggled: string
  assignment: { tracker: { name: string } & Record<string, unknown> }
  plan: (Omit<PlanItem, 'details'> & { details: unknown }) | null
  followups: unknown
  comments: unknown
}
