/**
 * What the student sees is the server's rows with their own unsynced changes laid on
 * top, so a save shows at once, online or not, marked with where it is.
 */
import type { FollowupStatus, OutboxItem } from './types'

export type Sync = 'synced' | 'pending' | 'parked'
const EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export type EntryView = {
  id: string
  assignment_id: string
  plan_item_id: string | null
  field_version: number
  date: string
  data: Record<string, unknown>
  /** Null until the server has it: a new entry's 7 days haven't started. */
  created_at: string | null
  sync: Sync
  reason?: string
}

export type FollowupView = {
  id: string
  entry_id: string
  assignment_id: string
  label: string
  due_date: string
  status: FollowupStatus
  created_at: string | null
  sync: Sync
  reason?: string
}

const state = (item: OutboxItem) =>
  item.parked
    ? { sync: 'parked' as const, reason: item.parked.reason }
    : { sync: 'pending' as const }

export function overlayEntries(
  server: readonly Omit<EntryView, 'sync' | 'reason'>[],
  outbox: readonly OutboxItem[],
): EntryView[] {
  const byId = new Map<string, EntryView>(server.map((e) => [e.id, { ...e, sync: 'synced' }]))
  for (const item of outbox) {
    const op = item.op
    if (op.kind === 'entry.create') {
      const { id, assignment_id, plan_item_id, field_version, date, data } = op.row
      const row = { id, assignment_id, plan_item_id, field_version, date, data }
      // Another device's row for the same session gives way to this one (it will merge).
      for (const [id, e] of byId) {
        if (
          id !== row.id &&
          e.assignment_id === row.assignment_id &&
          e.date === row.date &&
          e.plan_item_id === row.plan_item_id
        ) {
          byId.delete(id)
        }
      }
      byId.set(row.id, { ...row, created_at: byId.get(row.id)?.created_at ?? null, ...state(item) })
    } else if (op.kind === 'entry.update') {
      const existing = byId.get(op.id)
      if (existing) byId.set(op.id, { ...existing, ...op.patch, ...state(item) })
    } else if (op.kind === 'entry.delete') {
      // Cleared: gone at once. A clear the server refused leaves it shown, with why.
      const existing = byId.get(op.id)
      if (!item.parked) byId.delete(op.id)
      else if (existing) byId.set(op.id, { ...existing, ...state(item) })
    }
  }
  return [...byId.values()]
}

export function overlayFollowups(
  server: readonly Omit<FollowupView, 'sync' | 'reason'>[],
  outbox: readonly OutboxItem[],
): FollowupView[] {
  const byId = new Map<string, FollowupView>(server.map((f) => [f.id, { ...f, sync: 'synced' }]))
  // A cleared log's retries go with it.
  const cleared = new Set(
    outbox.flatMap((item) => (item.op.kind === 'entry.delete' && !item.parked ? [item.op.id] : [])),
  )
  for (const item of outbox) {
    const op = item.op
    if (op.kind === 'followup.create') {
      const { id, entry_id, assignment_id, label, due_date, status } = op.row
      const row = { id, entry_id, assignment_id, label, due_date, status }
      byId.set(row.id, { ...row, created_at: byId.get(row.id)?.created_at ?? null, ...state(item) })
    } else if (op.kind === 'followup.update') {
      const existing = byId.get(op.id)
      if (existing) byId.set(op.id, { ...existing, ...op.patch, ...state(item) })
    }
  }
  return [...byId.values()].filter((f) => !cleared.has(f.entry_id))
}

/** Entries can be changed for 7 days after they're logged (CLAUDE.md, security rule 3). */
export function isEditable(
  entry: Pick<EntryView, 'created_at'>,
  now: number = Date.now(),
): boolean {
  return entry.created_at === null || now - Date.parse(entry.created_at) < EDIT_WINDOW_MS
}
