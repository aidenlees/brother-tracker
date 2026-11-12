/**
 * Trackers for the builder (admin): every tracker, archived or not, with how many
 * students have it, and the writes that save one. Admin writes under RLS
 * (admin_can_write); the database bumps field_version and keeps a copy of each
 * version's questions (trackers_version, trackers_snapshot), so a log stays readable by
 * the questions it was made with.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { isAccent, type Draft } from '@/trackers/builder'
import {
  FieldDefinition,
  FollowupRules,
  MetricDefinition,
  PacingFlag,
  type TrackerDefinition,
} from '@/trackers/definition'
import type { Json } from './database.types'
import { useOutbox } from './outbox/outbox-context'
import { supabase } from './supabase'

export type AdminTracker = Omit<Draft, 'savedKeys'> & {
  id: string
  fieldVersion: number
  archived: boolean
  students: number
}

const Row = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  icon: z.string(),
  color: z.string(),
  cadence: z.union([
    z.object({ type: z.literal('plan'), plan_source: z.string().optional() }),
    z.object({ type: z.literal('daily') }),
  ]),
  field_version: z.number(),
  fields: z.array(FieldDefinition),
  metrics: z.array(MetricDefinition),
  followups: FollowupRules.nullable(),
  pacing_flags: z.array(PacingFlag).nullable(),
  display: z.enum(['inline_on_today_card', 'task_list']).nullable(),
  sort: z.number(),
  archived: z.boolean(),
  assignments: z.array(z.object({ count: z.number() })),
})

export function useAdminTrackers() {
  const { userId } = useOutbox()
  return useQuery({
    queryKey: [userId, 'builder', 'trackers'],
    staleTime: 0,
    queryFn: async (): Promise<AdminTracker[]> => {
      const { data, error } = await supabase
        .from('trackers')
        .select(
          'id, slug, name, icon, color, cadence, field_version, fields, metrics, followups, pacing_flags, display, sort, archived, assignments(count)',
        )
        .order('sort')
      if (error) throw error
      return (data as unknown[]).flatMap((raw) => {
        const row = Row.safeParse(raw)
        if (!row.success) return []
        const r = row.data
        return [
          {
            id: r.id,
            slug: r.slug,
            name: r.name,
            icon: r.icon,
            color: isAccent(r.color) ? r.color : 'ink-blue',
            cadence: r.cadence,
            display: r.display ?? undefined,
            fields: r.fields,
            metrics: r.metrics,
            followups: r.followups ?? undefined,
            pacingFlags: r.pacing_flags ?? undefined,
            sort: r.sort,
            fieldVersion: r.field_version,
            archived: r.archived,
            students: r.assignments[0]?.count ?? 0,
          },
        ]
      })
    },
  })
}

const refusedMessage =
  'The database refused that. If two-step sign-in is on, sign out and in again with a code.'

export function useTrackerWrites() {
  const { userId } = useOutbox()
  const queryClient = useQueryClient()
  const settle = () => queryClient.invalidateQueries({ queryKey: [userId] })

  /** Saves a draft: a new tracker, or the next version of one. Returns its id and version. */
  const save = useMutation({
    networkMode: 'always',
    onSettled: settle,
    mutationFn: async ({
      id,
      definition,
    }: {
      id: string | null
      definition: TrackerDefinition
    }): Promise<{ id: string; fieldVersion: number }> => {
      const row = {
        name: definition.name,
        icon: definition.icon,
        color: definition.color,
        cadence: definition.cadence,
        fields: definition.fields,
        // Loose objects (each metric's rule fields) as the jsonb column takes them.
        metrics: definition.metrics as Json[],
        followups: definition.followups ?? null,
        pacing_flags: definition.pacingFlags ?? [],
        display: definition.display ?? null,
        sort: definition.sort,
      }
      const query = id
        ? supabase.from('trackers').update(row).eq('id', id)
        : supabase.from('trackers').insert({ ...row, slug: definition.slug })
      const { data, error } = await query.select('id, field_version')
      if (error?.code === '23505') {
        throw new Error('A tracker with that name already exists. Choose another name.')
      }
      if (error?.code === '42501' || (!error && data.length === 0)) throw new Error(refusedMessage)
      if (error) throw new Error('That didn’t go through. Reload and try again.')
      const saved = data[0]
      if (!saved) throw new Error(refusedMessage)
      return { id: saved.id, fieldVersion: saved.field_version }
    },
  })

  const archive = useMutation({
    networkMode: 'always',
    onSettled: settle,
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { data, error } = await supabase
        .from('trackers')
        .update({ archived })
        .eq('id', id)
        .select('id')
      if (error || data.length === 0) throw new Error(refusedMessage)
    },
  })

  return { save, archive }
}
