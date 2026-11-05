import type { SupabaseClient } from '@supabase/supabase-js'

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
