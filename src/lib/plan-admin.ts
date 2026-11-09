/**
 * The admin's view of students' plans (the Plan screen): plan-cadence assignments, their
 * sessions, the baseline template, and the edits. Admin only: RLS lets the admin read
 * every plan and write plan_items (rule 6); for anyone else these return nothing and
 * change nothing. Edits go straight to the server (no outbox): the admin plans online.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isRecord } from '@/trackers/fields/contract'
import type { PlanItem } from '@/trackers/plan'
import type { Move } from '@/trackers/plan-edit'
import type { Json } from './database.types'
import { useOutbox } from './outbox/outbox-context'
import { supabase } from './supabase'

type JsonObject = { [key: string]: Json | undefined }

export type PlanAssignment = {
  id: string
  start_date: string
  plan_template_id: string | null
  studentName: string
  tracker: { id: string; slug: string; name: string; icon: string; color: string }
}

export type TemplateItem = {
  date: string
  title: string
  sort: number
  details: Readonly<Record<string, unknown>>
}
export type Template = { first_date: string; items: TemplateItem[] }

export function usePlanAssignments() {
  const { userId } = useOutbox()
  return useQuery({
    queryKey: [userId, 'admin', 'plan-assignments'],
    queryFn: async (): Promise<PlanAssignment[]> => {
      const { data, error } = await supabase
        .from('assignments')
        .select(
          'id, start_date, plan_template_id, student:profiles!assignments_student_id_fkey(display_name), tracker:trackers!inner(id, slug, name, icon, color, cadence, display, archived)',
        )
        .eq('active', true)
      if (error) throw error
      return data
        .filter(
          (row) =>
            !row.tracker.archived &&
            isRecord(row.tracker.cadence) &&
            row.tracker.cadence.type === 'plan' &&
            // Tasks have their own screen.
            row.tracker.display !== 'task_list',
        )
        .map((row) => ({
          id: row.id,
          start_date: row.start_date,
          plan_template_id: row.plan_template_id,
          studentName: row.student.display_name,
          tracker: {
            id: row.tracker.id,
            slug: row.tracker.slug,
            name: row.tracker.name,
            icon: row.tracker.icon,
            color: row.tracker.color,
          },
        }))
        .sort((a, b) => a.studentName.localeCompare(b.studentName))
    },
  })
}

export function usePlanSessions(assignmentId: string | undefined) {
  const { userId } = useOutbox()
  return useQuery({
    queryKey: [userId, 'admin', 'plan-items', assignmentId],
    enabled: assignmentId !== undefined,
    queryFn: async (): Promise<PlanItem[]> => {
      const { data, error } = await supabase
        .from('plan_items')
        .select('id, assignment_id, date, title, details, sort')
        .eq('assignment_id', assignmentId ?? '')
        .order('date')
        .order('sort')
      if (error) throw error
      return data.map((row) => ({ ...row, details: isRecord(row.details) ? row.details : {} }))
    },
  })
}

/** Which sessions of the assignment have an entry (the admin reads every entry). */
export function useLoggedSessions(assignmentId: string | undefined) {
  const { userId } = useOutbox()
  return useQuery({
    queryKey: [userId, 'admin', 'logged', assignmentId],
    enabled: assignmentId !== undefined,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('entries')
        .select('plan_item_id')
        .eq('assignment_id', assignmentId ?? '')
        .not('plan_item_id', 'is', null)
      if (error) throw error
      return new Set(data.flatMap((row) => (row.plan_item_id ? [row.plan_item_id] : [])))
    },
  })
}

/** The baseline plan the assignment was made from (seed/math_sessions.json for math). */
export function useTemplate(templateId: string | null | undefined) {
  const { userId } = useOutbox()
  return useQuery({
    queryKey: [userId, 'admin', 'template', templateId],
    enabled: typeof templateId === 'string',
    queryFn: async (): Promise<Template> => {
      const { data, error } = await supabase
        .from('plan_templates')
        .select('first_date, items')
        .eq('id', templateId ?? '')
        .single()
      if (error) throw error
      const items = Array.isArray(data.items) ? data.items : []
      return {
        first_date: data.first_date,
        items: items.flatMap((raw) =>
          isRecord(raw) && typeof raw.date === 'string' && typeof raw.title === 'string'
            ? [
                {
                  date: raw.date,
                  title: raw.title,
                  sort: typeof raw.sort === 'number' ? raw.sort : 0,
                  details: isRecord(raw.details) ? raw.details : {},
                },
              ]
            : [],
        ),
      }
    },
  })
}

export type SessionEdit = {
  date: string
  title: string
  details: Record<string, unknown>
}

/** Saving one session, and moving several: both refresh the plan afterwards. */
export function usePlanEdits(assignmentId: string | undefined) {
  const { userId } = useOutbox()
  const client = useQueryClient()
  const refresh = () =>
    client.invalidateQueries({ queryKey: [userId, 'admin', 'plan-items', assignmentId] })

  const save = useMutation({
    mutationFn: async ({ id, edit }: { id: string; edit: SessionEdit }) => {
      const { data, error } = await supabase
        .from('plan_items')
        .update({ ...edit, details: edit.details as JsonObject })
        .eq('id', id)
        .select('id')
      if (error) throw error
      if (data.length === 0) throw new Error('Nothing was saved: only the admin can change a plan.')
    },
    onSuccess: refresh,
  })

  const move = useMutation({
    mutationFn: async (moves: Move[]) => {
      const { data, error } = await supabase.rpc('set_session_dates', { moves })
      if (error) throw error
      if (data !== moves.length) throw new Error('Not every session moved. Reload and try again.')
    },
    onSuccess: refresh,
  })

  return { save, move }
}
