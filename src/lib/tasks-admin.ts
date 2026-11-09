/**
 * The admin's side of tasks (the Tasks screen): the task tracker (any tracker with
 * display: task_list, so no slug is named here), each student's tasks with whether they're
 * done, and adding, editing and deleting them. RLS decides: only the admin writes plan
 * items (rule 6) and clears a log (rule 3). Straight to the server: the admin works online.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isRecord } from '@/trackers/fields/contract'
import type { PlanItem } from '@/trackers/plan'
import type { Json } from './database.types'
import { useOutbox } from './outbox/outbox-context'
import { supabase } from './supabase'

type JsonObject = { [key: string]: Json | undefined }

export type TaskTracker = { id: string; slug: string; name: string }

export type AdminTask = PlanItem & {
  /** The student's log of it: when it was ticked off. */
  entry: { id: string; date: string } | null
}

/** The task tracker, if one exists (the first by sort order). */
export function useTaskTracker() {
  const { userId } = useOutbox()
  return useQuery({
    queryKey: [userId, 'tasks', 'tracker'],
    queryFn: async (): Promise<TaskTracker | null> => {
      const { data, error } = await supabase
        .from('trackers')
        .select('id, slug, name')
        .eq('display', 'task_list')
        .eq('archived', false)
        .order('sort')
        .limit(1)
      if (error) throw error
      return data[0] ?? null
    },
  })
}

/** One student's tasks, by date, with their logs. */
export function useStudentTasks(trackerId: string | undefined, studentId: string | undefined) {
  const { userId } = useOutbox()
  return useQuery({
    queryKey: [userId, 'tasks', 'list', trackerId, studentId],
    enabled: trackerId !== undefined && studentId !== undefined,
    // Always fresh when opened: the student may have just ticked one off.
    staleTime: 0,
    queryFn: async (): Promise<AdminTask[]> => {
      const { data, error } = await supabase
        .from('plan_items')
        .select(
          'id, assignment_id, date, title, details, sort, entries(id, date), assignment:assignments!inner(tracker_id, student_id)',
        )
        .eq('assignment.tracker_id', trackerId ?? '')
        .eq('assignment.student_id', studentId ?? '')
        .order('date')
        .order('sort')
        .order('title')
      if (error) throw error
      return data.map((row) => ({
        id: row.id,
        assignment_id: row.assignment_id,
        date: row.date,
        title: row.title,
        details: isRecord(row.details) ? row.details : {},
        sort: row.sort,
        entry: row.entries[0] ?? null,
      }))
    },
  })
}

export type NewTasks = {
  tracker: TaskTracker
  studentIds: string[]
  title: string
  notes: string
  dates: string[]
  /** The day the student's task tracker starts, if this is their first task. */
  today: string
}

export type TaskEdit = { title: string; notes: string; date: string }

/** The task's details with its notes replaced (none when blank). */
const details = (base: PlanItem['details'], notes: string): JsonObject => {
  const rest: JsonObject = { ...(base as JsonObject) }
  delete rest.notes
  return notes.trim() ? { ...rest, notes: notes.trim() } : rest
}

/** Deletes the logs (if any), then the tasks. A task's log has to go first (entries keep their plan item). */
async function deleteTasks(tasks: readonly AdminTask[]): Promise<void> {
  const logs = tasks.flatMap((t) => (t.entry ? [t.entry.id] : []))
  if (logs.length > 0) {
    const { data, error } = await supabase.from('entries').delete().in('id', logs).select('id')
    if (error) throw error
    if (data.length !== logs.length)
      throw new Error('Not every log was cleared. Reload and try again.')
  }
  const { data, error } = await supabase
    .from('plan_items')
    .delete()
    .in(
      'id',
      tasks.map((t) => t.id),
    )
    .select('id')
  if (error) throw error
  if (data.length !== tasks.length)
    throw new Error('Not every task was deleted. Reload and try again.')
}

export function useTaskEdits() {
  const { userId } = useOutbox()
  const client = useQueryClient()
  // The lists, Overview's logs and the plan editor's marks all read these rows.
  const refresh = () => client.invalidateQueries({ queryKey: [userId] })

  const add = useMutation({
    mutationFn: async ({ tracker, studentIds, title, notes, dates, today }: NewTasks) => {
      const series = dates.length > 1 ? crypto.randomUUID() : null
      for (const student of studentIds) {
        // The first task assigns the student the task tracker (idempotent after that).
        const { data: assignmentId, error } = await supabase.rpc('assign_tracker', {
          student,
          tracker_slug: tracker.slug,
          start: today,
        })
        if (error) throw error
        const rows = dates.map((date) => ({
          assignment_id: assignmentId,
          date,
          title: title.trim(),
          details: details(series ? { series } : {}, notes),
          sort: 0,
        }))
        const { error: insertError } = await supabase.from('plan_items').insert(rows)
        if (insertError) throw insertError
      }
    },
    onSuccess: refresh,
  })

  const save = useMutation({
    mutationFn: async ({ task, edit }: { task: AdminTask; edit: TaskEdit }) => {
      const { data, error } = await supabase
        .from('plan_items')
        .update({
          title: edit.title.trim(),
          date: edit.date,
          details: details(task.details, edit.notes),
        })
        .eq('id', task.id)
        .select('id')
      if (error) throw error
      if (data.length === 0) throw new Error('Nothing was saved: only the admin can change a task.')
    },
    onSuccess: refresh,
  })

  const remove = useMutation({
    mutationFn: deleteTasks,
    onSuccess: refresh,
  })

  return { add, save, remove }
}
