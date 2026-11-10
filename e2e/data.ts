import type { SupabaseClient } from '@supabase/supabase-js'
import { localSql } from './supabase'

/** Today in New York (the app's and the database's "today"). */
export function todayNY(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** The signed-in student's assignment for a tracker slug. */
export async function assignmentId(client: SupabaseClient, slug: string): Promise<string> {
  const { data, error } = await client
    .from('assignments')
    .select('id, trackers!inner(slug)')
    .eq('trackers.slug', slug)
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

/** The student's entries for one tracker on one date (RLS: only their own). */
export async function entriesOn(client: SupabaseClient, slug: string, date: string) {
  const { data, error } = await client
    .from('entries')
    .select('id, plan_item_id, date, data')
    .eq('assignment_id', await assignmentId(client, slug))
    .eq('date', date)
  if (error) throw error
  return data as { id: string; plan_item_id: string | null; date: string; data: unknown }[]
}

/** Deletes the student's entries for a tracker on a date (allowed within 7 days). */
export async function clearEntries(client: SupabaseClient, slug: string, date: string) {
  const { error } = await client
    .from('entries')
    .delete()
    .eq('assignment_id', await assignmentId(client, slug))
    .eq('date', date)
  if (error) throw error
}

/** The plan item for a session number in the student's plan for a tracker. */
export async function planItemId(client: SupabaseClient, slug: string, session: number) {
  const { data, error } = await client
    .from('plan_items')
    .select('id, details')
    .eq('assignment_id', await assignmentId(client, slug))
  if (error) throw error
  const item = (data as { id: string; details: { session?: number } }[]).find(
    (i) => i.details.session === session,
  )
  if (!item) throw new Error(`no session ${String(session)} in ${slug}`)
  return item.id
}

/** "Wednesday, November 4", as the app writes a date out in full. */
export function longDay(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${iso}T00:00:00Z`))
}

/** "Wed, Nov 4", as the app writes a date out short. */
export function shortDay(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${iso}T00:00:00Z`))
}

/** Every comment on the LOCAL stack goes (the fixtures have none; specs add their own). */
export function clearComments(): void {
  localSql('delete from public.comments')
}

/** A tracker's current field_version: new entries must use it (a fresh seed starts at 1). */
export async function fieldVersion(client: SupabaseClient, slug: string): Promise<number> {
  const { data, error } = await client
    .from('trackers')
    .select('field_version')
    .eq('slug', slug)
    .single()
  if (error) throw error
  const row: unknown = data
  return (row as { field_version: number }).field_version
}

/**
 * Takes the task tracker away from every student, with their task logs (LOCAL ONLY), so
 * a spec starts from no tasks. One statement per call: the CLI runs each as one query.
 */
export function resetTasks(): void {
  localSql(
    "delete from public.entries e using public.assignments a, public.trackers t where e.assignment_id = a.id and a.tracker_id = t.id and t.display = 'task_list'",
  )
  localSql(
    "delete from public.assignments a using public.trackers t where a.tracker_id = t.id and t.display = 'task_list'",
  )
}

/** Gives a student tasks directly (LOCAL ONLY), for screenshots: [date, title, notes]. */
export function seedTasks(student: string, tasks: [string, string, string | null][]): void {
  const q = (v: string) => `'${v.replaceAll("'", "''")}'`
  localSql(
    `select public.assign_tracker((select id from public.profiles where display_name = ${q(student)}), (select slug from public.trackers where display = 'task_list' order by sort limit 1), ${q(todayNY())})`,
  )
  const rows = tasks
    .map(
      ([date, title, notes]) =>
        `(${q(date)}::date, ${q(title)}, ${q(JSON.stringify(notes ? { notes } : {}))}::jsonb)`,
    )
    .join(', ')
  localSql(
    `insert into public.plan_items (assignment_id, date, title, details) select a.id, d.date, d.title, d.details from public.assignments a join public.trackers t on t.id = a.tracker_id join public.profiles p on p.id = a.student_id, (values ${rows}) as d (date, title, details) where t.display = 'task_list' and p.display_name = ${q(student)}`,
  )
}
