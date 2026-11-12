/**
 * People (admin): everyone who can sign in, their viewer links and their trackers.
 * Accounts (creating one, a temporary password, disabling, a role) go through the
 * admin-users Edge Function, the only holder of the service key; names, viewer links
 * and assignments are ordinary admin writes under RLS (admin_can_write: two-step once
 * it's on). CLAUDE.md, "Adding people".
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { isRecord } from '@/trackers/fields/contract'
import { useOutbox } from './outbox/outbox-context'
import { supabase, type Role } from './supabase'

export type Person = {
  id: string
  name: string
  role: Role
  active: boolean
  email: string | null
  lastSignInAt: string | null
}

export type TrackerOption = { id: string; slug: string; name: string; icon: string; color: string }

export type PersonAssignment = {
  id: string
  studentId: string
  startDate: string
  active: boolean
  tracker: TrackerOption
}

export type People = {
  people: Person[]
  links: { viewerId: string; studentId: string }[]
  assignments: PersonAssignment[]
  trackers: TrackerOption[]
}

/** What went wrong with an account change, in words: the function's, or the network's. */
export async function functionError(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body: unknown = await (error.context as Response).json()
      if (isRecord(body) && typeof body.error === 'string') return new Error(body.error)
    } catch {
      // fall through
    }
    return new Error('That didn’t go through. Reload and try again.')
  }
  if (error instanceof FunctionsFetchError) {
    return new Error('Couldn’t reach the server. Check your connection, then try again.')
  }
  return new Error('That didn’t go through. Reload and try again.')
}

export async function adminUsers<T>(body: Record<string, unknown>): Promise<T> {
  const result = await supabase.functions.invoke<T>('admin-users', { body })
  const error: unknown = result.error
  if (error) throw await functionError(error)
  return result.data as T
}

/** A database write the server refused or skipped (0 rows), in words. */
function refused(error: { code?: string } | null, rows: number | null): Error | null {
  if (error?.code === '42501' || rows === 0) {
    return new Error(
      'The database refused that. If two-step sign-in is on, sign in again with a code.',
    )
  }
  if (error) return new Error('That didn’t go through. Reload and try again.')
  return null
}

/** A temporary password: 14 characters from an alphabet without look-alikes. */
export function temporaryPassword(random: (n: number) => Uint8Array = cryptoBytes): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  // Rejection sampling keeps every character equally likely.
  const limit = 256 - (256 % alphabet.length)
  let out = ''
  while (out.length < 14) {
    for (const byte of random(32)) {
      if (byte < limit && out.length < 14) out += alphabet[byte % alphabet.length] ?? ''
    }
  }
  return out
}

function cryptoBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n))
}

export function usePeople() {
  const { userId } = useOutbox()
  return useQuery({
    queryKey: [userId, 'people'],
    staleTime: 0,
    networkMode: 'always',
    queryFn: async (): Promise<People> => {
      const [profiles, links, assignments, trackers, accounts] = await Promise.all([
        supabase.from('profiles').select('id, role, display_name, active').order('display_name'),
        supabase.from('viewer_links').select('viewer_id, student_id'),
        supabase
          .from('assignments')
          .select(
            'id, student_id, start_date, active, tracker:trackers!inner(id, slug, name, icon, color, sort)',
          )
          .order('start_date'),
        supabase
          .from('trackers')
          .select('id, slug, name, icon, color, sort')
          .eq('archived', false)
          .order('sort'),
        adminUsers<{
          accounts: { id: string; email: string | null; lastSignInAt: string | null }[]
        }>({ action: 'list' }),
      ])
      for (const result of [profiles, links, assignments, trackers]) {
        if (result.error) throw result.error
      }
      const byId = new Map(accounts.accounts.map((a) => [a.id, a]))
      return {
        people: (profiles.data ?? []).map((p) => ({
          id: p.id,
          name: p.display_name,
          role: p.role as Role,
          active: p.active,
          email: byId.get(p.id)?.email ?? null,
          lastSignInAt: byId.get(p.id)?.lastSignInAt ?? null,
        })),
        links: (links.data ?? []).map((l) => ({ viewerId: l.viewer_id, studentId: l.student_id })),
        assignments: (assignments.data ?? []).map((a) => ({
          id: a.id,
          studentId: a.student_id,
          startDate: a.start_date,
          active: a.active,
          tracker: a.tracker,
        })),
        trackers: trackers.data ?? [],
      }
    },
  })
}

export function usePeopleWrites() {
  const { userId } = useOutbox()
  const queryClient = useQueryClient()
  const options = {
    networkMode: 'always' as const,
    onSettled: () => queryClient.invalidateQueries({ queryKey: [userId, 'people'] }),
  }

  const create = useMutation({
    ...options,
    mutationFn: (input: { email: string; password: string; displayName: string; role: Role }) =>
      adminUsers<{ id: string }>({ action: 'create', ...input }),
  })
  const setPassword = useMutation({
    ...options,
    mutationFn: (input: { userId: string; password: string }) =>
      adminUsers({ action: 'password', ...input }),
  })
  const setActive = useMutation({
    ...options,
    mutationFn: (input: { userId: string; active: boolean }) =>
      adminUsers({ action: 'active', ...input }),
  })
  const setRole = useMutation({
    ...options,
    mutationFn: (input: { userId: string; role: Role }) => adminUsers({ action: 'role', ...input }),
  })
  const rename = useMutation({
    ...options,
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { data, error } = await supabase
        .from('profiles')
        .update({ display_name: name })
        .eq('id', id)
        .select('id')
      const problem = refused(error, data?.length ?? null)
      if (problem) throw problem
    },
  })
  const link = useMutation({
    ...options,
    mutationFn: async ({
      viewerId,
      studentId,
      linked,
    }: {
      viewerId: string
      studentId: string
      linked: boolean
    }) => {
      if (linked) {
        const { error } = await supabase
          .from('viewer_links')
          .insert({ viewer_id: viewerId, student_id: studentId })
        const problem = refused(error, null)
        if (problem) throw problem
      } else {
        const { data, error } = await supabase
          .from('viewer_links')
          .delete()
          .eq('viewer_id', viewerId)
          .eq('student_id', studentId)
          .select('viewer_id')
        const problem = refused(error, data?.length ?? null)
        if (problem) throw problem
      }
    },
  })
  const assign = useMutation({
    ...options,
    mutationFn: async ({
      studentId,
      slug,
      start,
    }: {
      studentId: string
      slug: string
      start: string
    }) => {
      const { error } = await supabase.rpc('assign_tracker', {
        student: studentId,
        tracker_slug: slug,
        start,
      })
      const problem = refused(error, null)
      if (problem) throw problem
    },
  })
  const pause = useMutation({
    ...options,
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { data, error } = await supabase
        .from('assignments')
        .update({ active })
        .eq('id', id)
        .select('id')
      const problem = refused(error, data?.length ?? null)
      if (problem) throw problem
    },
  })

  return { create, setPassword, setActive, setRole, rename, link, assign, pause }
}
