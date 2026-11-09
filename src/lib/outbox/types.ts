/**
 * The offline outbox (CLAUDE.md: "never loses an entry"). Every write a student makes
 * is first an op kept on this device; the sync engine sends ops to Supabase in order
 * and deletes each one only once the server has it. Ids are made on the device, so an
 * op can be retried safely and later ops can point at an entry that isn't synced yet.
 */

export type FollowupStatus = 'open' | 'done' | 'dropped'

/** The columns a student may write (core_schema's column grants). */
export type EntryRow = {
  id: string
  assignment_id: string
  plan_item_id: string | null
  field_version: number
  date: string
  data: Record<string, unknown>
  owner_id: string
}
export type EntryPatch = Partial<Pick<EntryRow, 'plan_item_id' | 'field_version' | 'date' | 'data'>>

export type FollowupRow = {
  id: string
  entry_id: string
  assignment_id: string
  label: string
  due_date: string
  status: FollowupStatus
  owner_id: string
}
export type FollowupPatch = Partial<Pick<FollowupRow, 'label' | 'due_date' | 'status'>>

export type Op =
  | { kind: 'entry.create'; row: EntryRow }
  | { kind: 'entry.update'; id: string; patch: EntryPatch }
  /** Clear a log: the server deletes it, with its retries and comments. */
  | { kind: 'entry.delete'; id: string }
  | { kind: 'followup.create'; row: FollowupRow }
  | { kind: 'followup.update'; id: string; patch: FollowupPatch }
  /** Upload a photo kept on the device, then add its attachments row (id = attachment id). */
  | { kind: 'photo.upload'; id: string; entry_id: string; owner_id: string }

export type OutboxItem = {
  /** `${userId}:${sequence}`: sorts in the order the ops were made. */
  key: string
  userId: string
  op: Op
  queuedAt: string
  /** Set when the server refused the op. It stays here, shown, until fixed or replaced. */
  parked: { reason: string; at: string } | null
}

/** A log in progress, autosaved on every change so closing the tab loses nothing. */
export type Draft = {
  key: string
  userId: string
  assignmentId: string
  planItemId: string | null
  date: string
  /** The entry this draft becomes: an existing entry's id when editing, a new id otherwise. */
  entryId: string
  editing: boolean
  fieldVersion: number
  data: Record<string, unknown>
  step: number
  startedAt: string
  updatedAt: string
}
