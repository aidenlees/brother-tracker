/**
 * One sync pass: send this user's ops to the server, oldest first.
 *
 *   - Inserts never use upsert. PostgREST's ON CONFLICT update would also write id,
 *     owner_id and assignment_id, which the column grants refuse. So: insert, and on a
 *     duplicate primary key (an earlier try landed but its answer was lost) update the
 *     writable columns instead.
 *   - A duplicate slot (assignment, date, plan item) means another device logged the
 *     same session: update that row (last write wins; audit_log keeps the old one) and
 *     point later ops at its id.
 *   - No answer from the server (offline, 5xx, an expired token) stops the pass; the
 *     rest wait, in order, for the next one.
 *   - A refusal (RLS, validation, the 7-day lock) parks the op with the reason. It stays
 *     on the device, and ops that need its entry wait behind it.
 *   - Clearing a log deletes it. A delete RLS refuses also changes nothing, so when none
 *     is deleted, a look tells "never got here, or already gone" (done) from "locked".
 */
import { isUnreachable } from '../identity'
import { deletePhoto, getPhoto } from './photos'
import { completeItem, getItem, listOutbox, parkItem, remapEntry, withFlushLock } from './store'
import type { EntryPatch, EntryRow, FollowupPatch, FollowupRow, Op } from './types'

export type ApiError = { code?: string; message: string }
/** `rows`: how many rows an update changed (RLS refuses updates silently, with 0). */
export type ApiResult = { error: ApiError | null; status: number; rows?: number }

export type OutboxApi = {
  insertEntry: (row: EntryRow) => Promise<ApiResult>
  updateEntry: (id: string, patch: EntryPatch) => Promise<ApiResult>
  /** rows: how many entries were deleted (0 when RLS refused, or there was none). */
  deleteEntry: (id: string) => Promise<ApiResult>
  /** Whether the entry is on the server (rows: 1 or 0). */
  findEntry: (id: string) => Promise<ApiResult>
  findEntryId: (
    slot: Pick<EntryRow, 'assignment_id' | 'date' | 'plan_item_id'>,
  ) => Promise<ApiResult & { id: string | null }>
  insertFollowup: (row: FollowupRow) => Promise<ApiResult>
  updateFollowup: (id: string, patch: FollowupPatch) => Promise<ApiResult>
  /** Uploads to the private attachments bucket; status 409 when the object already exists. */
  uploadPhoto: (path: string, blob: Blob) => Promise<ApiResult>
  insertAttachment: (row: AttachmentRow) => Promise<ApiResult>
  /** Whether the attachments row exists (rows: 1 or 0). */
  findAttachment: (id: string) => Promise<ApiResult>
}

export type AttachmentRow = {
  id: string
  entry_id: string
  storage_path: string
  kind: 'photo'
  owner_id: string
}

export type FlushResult = {
  synced: number
  parked: number
  /** Ops left waiting behind a refused entry. */
  waiting: number
  /** The pass stopped because the server couldn't be reached. */
  offline: boolean
}

export const REASONS = {
  locked: 'Locked: an entry can only be changed for 7 days after it’s logged.',
  clearLocked:
    'Locked: a log can only be cleared for 7 days after it’s logged. Ask your admin to clear it.',
  cleared: 'This log was cleared, so the change can’t be saved. Discard it, then log it again.',
  followupLocked: 'This retry can’t be changed any more.',
  otherDevice:
    'This session was also logged on another device, and that entry can’t be changed now.',
  photoGone: 'The photo is no longer on this device. Add it again from the entry.',
} as const

type Outcome =
  | { kind: 'done'; remap?: { from: string; to: string } }
  | { kind: 'retry' }
  | { kind: 'refused'; reason: string }

const done: Outcome = { kind: 'done' }

function describe(error: ApiError): string {
  if (error.code === '42501' && /row-level security/i.test(error.message)) {
    return 'Not accepted. Its date may be outside this tracker’s dates, or the tracker is turned off.'
  }
  if (error.code === '23503') return 'Not accepted: it refers to something that no longer exists.'
  return `Not accepted: ${error.message}`
}

function classify(result: ApiResult): Outcome {
  const { error, status } = result
  if (!error) return done
  if (
    isUnreachable(error, status) ||
    [401, 408, 429].includes(status) ||
    error.code === 'PGRST301' ||
    error.code === 'PGRST303' ||
    // Only a request without a valid session (sent as anon) lacks the table grants.
    (error.code === '42501' && /permission denied for (table|schema)/i.test(error.message))
  ) {
    return { kind: 'retry' }
  }
  return { kind: 'refused', reason: describe(error) }
}

/** An update must change exactly one row; zero means RLS (the lock) said no. */
function expectOne(result: ApiResult, reason: string): Outcome {
  if (result.error) return classify(result)
  return (result.rows ?? 0) > 0 ? done : { kind: 'refused', reason }
}

const writable = (row: EntryRow): EntryPatch => ({
  plan_item_id: row.plan_item_id,
  field_version: row.field_version,
  date: row.date,
  data: row.data,
})

async function run(op: Op, api: OutboxApi): Promise<Outcome> {
  switch (op.kind) {
    case 'entry.create': {
      const inserted = await api.insertEntry(op.row)
      if (inserted.error?.code !== '23505') return classify(inserted)
      if (inserted.error.message.includes('entries_pkey')) {
        return expectOne(await api.updateEntry(op.row.id, writable(op.row)), REASONS.locked)
      }
      if (inserted.error.message.includes('entries_one_per_slot')) {
        const found = await api.findEntryId(op.row)
        if (found.error) return classify(found)
        if (!found.id) return { kind: 'refused', reason: REASONS.otherDevice }
        const outcome = expectOne(
          await api.updateEntry(found.id, writable(op.row)),
          REASONS.otherDevice,
        )
        return outcome.kind === 'done'
          ? { kind: 'done', remap: { from: op.row.id, to: found.id } }
          : outcome
      }
      return classify(inserted)
    }
    case 'entry.update': {
      // Nothing changed: the lock said no, or the log is gone (cleared by the admin).
      const updated = await api.updateEntry(op.id, op.patch)
      if (updated.error || (updated.rows ?? 0) > 0) return classify(updated)
      const found = await api.findEntry(op.id)
      if (found.error) return classify(found)
      return {
        kind: 'refused',
        reason: (found.rows ?? 0) > 0 ? REASONS.locked : REASONS.cleared,
      }
    }
    case 'entry.delete': {
      const deleted = await api.deleteEntry(op.id)
      if (deleted.error) return classify(deleted)
      if ((deleted.rows ?? 0) > 0) return done
      const found = await api.findEntry(op.id)
      if (found.error) return classify(found)
      return (found.rows ?? 0) > 0 ? { kind: 'refused', reason: REASONS.clearLocked } : done
    }
    case 'followup.create': {
      const inserted = await api.insertFollowup(op.row)
      if (inserted.error?.code !== '23505') return classify(inserted)
      const { label, due_date, status } = op.row
      return expectOne(
        await api.updateFollowup(op.row.id, { label, due_date, status }),
        REASONS.followupLocked,
      )
    }
    case 'followup.update':
      return expectOne(await api.updateFollowup(op.id, op.patch), REASONS.followupLocked)
    case 'photo.upload': {
      const photo = await getPhoto(op.id)
      if (!photo) {
        // An earlier pass may have finished it and been cut off before saying so.
        const found = await api.findAttachment(op.id)
        if (found.error) return classify(found)
        return (found.rows ?? 0) > 0 ? done : { kind: 'refused', reason: REASONS.photoGone }
      }
      const path = `${op.owner_id}/${op.entry_id}/${op.id}.jpg`
      const uploaded = await api.uploadPhoto(path, photo.blob)
      if (uploaded.error && uploaded.status !== 409) return classify(uploaded)
      const row = {
        id: op.id,
        entry_id: op.entry_id,
        storage_path: path,
        kind: 'photo' as const,
        owner_id: op.owner_id,
      }
      const inserted = await api.insertAttachment(row)
      if (inserted.error && inserted.error.code !== '23505') return classify(inserted)
      await deletePhoto(op.id)
      return done
    }
  }
}

/** The entry an op needs to exist on the server first, if any. */
function needs(op: Op): string | null {
  if (op.kind === 'followup.create') return op.row.entry_id
  if (op.kind === 'entry.update') return op.id
  if (op.kind === 'photo.upload') return op.entry_id
  return null
}

export function flushOutbox(userId: string, api: OutboxApi): Promise<FlushResult> {
  return withFlushLock(async () => {
    const keys = (await listOutbox(userId)).map((item) => item.key)
    const result: FlushResult = { synced: 0, parked: 0, waiting: 0, offline: false }
    /** Entries whose create hasn't reached the server; ops that need them wait. */
    const missing = new Set<string>()

    for (const key of keys) {
      // Read each op fresh: an earlier step may have remapped it, or the student changed it.
      const item = await getItem(key)
      if (!item) continue
      const { op } = item
      if (item.parked) {
        if (op.kind === 'entry.create') missing.add(op.row.id)
        continue
      }
      const needed = needs(op)
      if (needed && missing.has(needed)) {
        result.waiting += 1
        continue
      }

      const outcome = await run(op, api)
      if (outcome.kind === 'retry') {
        result.offline = true
        return result
      }
      if (outcome.kind === 'refused') {
        await parkItem(key, op, outcome.reason)
        result.parked += 1
        if (op.kind === 'entry.create') missing.add(op.row.id)
        continue
      }
      await completeItem(key, op)
      result.synced += 1
      if (outcome.remap) await remapEntry(userId, outcome.remap.from, outcome.remap.to)
    }
    return result
  })
}
