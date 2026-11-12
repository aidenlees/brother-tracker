/**
 * Everything one student has logged, for Export: each tracker's entries with their plan
 * item, retries and comments, and every field the tracker has ever had (from
 * tracker_versions, so an answer to a field since removed still exports). RLS decides
 * what comes back; Export is the admin's.
 */
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { COMMENT_COLUMNS, parseComments } from '@/lib/comments'
import { useOutbox } from '@/lib/outbox/outbox-context'
import { supabase } from '@/lib/supabase'
import { FieldDefinition } from '@/trackers/definition'
import { isRecord } from '@/trackers/fields/contract'
import type { PlanItem } from '@/trackers/plan'
import { allFields, type ExportEntry, type ExportRetry, type ExportTracker } from './tables'

/** Rows per request: Supabase's Data API returns at most 1,000 at a time. */
const PAGE = 1000

type RawEntry = {
  id: string
  date: string
  created_at: string
  updated_at: string
  data: unknown
  assignment: { tracker: { id: string; name: string; cadence: unknown; sort: number } }
  plan: (Omit<PlanItem, 'details'> & { details: unknown }) | null
  followups: unknown
  comments: unknown
}

const Fields = z.array(FieldDefinition)

function retries(rows: unknown): ExportRetry[] {
  return (Array.isArray(rows) ? rows : [])
    .filter(
      (r): r is ExportRetry =>
        isRecord(r) &&
        typeof r.label === 'string' &&
        typeof r.due_date === 'string' &&
        typeof r.status === 'string',
    )
    .map(({ label, due_date, status }) => ({ label, due_date, status }))
}

async function fetchEntries(studentId: string): Promise<RawEntry[]> {
  const all: RawEntry[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('entries')
      .select(
        'id, date, created_at, updated_at, data, ' +
          'assignment:assignments!inner(tracker:trackers!inner(id, name, cadence, sort)), ' +
          'plan:plan_items(id, assignment_id, date, title, details, sort), ' +
          `followups(label, due_date, status), comments(${COMMENT_COLUMNS})`,
      )
      .eq('owner_id', studentId)
      .order('date')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    const rows = data as unknown as RawEntry[]
    all.push(...rows)
    if (rows.length < PAGE) return all
  }
}

export function useExportData(studentId: string | undefined) {
  const { userId } = useOutbox()
  return useQuery({
    queryKey: [userId, 'export', studentId],
    enabled: studentId !== undefined,
    staleTime: 0,
    queryFn: async (): Promise<ExportTracker[]> => {
      const rows = await fetchEntries(studentId ?? '')
      const trackerIds = [...new Set(rows.map((r) => r.assignment.tracker.id))]
      if (trackerIds.length === 0) return []
      const versions = await supabase
        .from('tracker_versions')
        .select('tracker_id, field_version, fields')
        .in('tracker_id', trackerIds)
      if (versions.error) throw versions.error

      const trackers = new Map<string, ExportTracker & { sort: number }>()
      for (const row of rows) {
        const t = row.assignment.tracker
        let tracker = trackers.get(t.id)
        if (!tracker) {
          const own = versions.data
            .filter((v) => v.tracker_id === t.id)
            .flatMap((v) => {
              const fields = Fields.safeParse(v.fields)
              return fields.success ? [{ field_version: v.field_version, fields: fields.data }] : []
            })
          tracker = {
            name: t.name,
            cadence: isRecord(t.cadence) && t.cadence.type === 'daily' ? 'daily' : 'plan',
            fields: allFields(own),
            entries: [],
            sort: t.sort,
          }
          trackers.set(t.id, tracker)
        }
        const entry: ExportEntry = {
          id: row.id,
          date: row.date,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          data: isRecord(row.data) ? row.data : {},
          plan: row.plan
            ? { ...row.plan, details: isRecord(row.plan.details) ? row.plan.details : {} }
            : null,
          retries: retries(row.followups),
          comments: parseComments(row.comments),
        }
        tracker.entries.push(entry)
      }
      return [...trackers.values()]
        .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
        .map(({ name, cadence, fields, entries }) => ({ name, cadence, fields, entries }))
    },
  })
}

/** Hands the browser a file to save. */
export function download(name: string, contents: string | Uint8Array, type: string): void {
  const part: BlobPart = typeof contents === 'string' ? contents : new Uint8Array(contents)
  const url = URL.createObjectURL(new Blob([part], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  // Give the download a moment to start before the address is let go.
  window.setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 1000)
}
