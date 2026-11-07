// @vitest-environment node
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getPhoto, putPhoto } from './photos'
import { draftKey, enqueue, getDraft, listOutbox, saveDraft, deleteDraft } from './store'
import { flushOutbox, REASONS, type ApiResult, type AttachmentRow, type OutboxApi } from './sync'
import type { EntryRow, FollowupRow } from './types'

/**
 * A stand-in for Supabase with the same rules the outbox relies on: primary keys, the
 * one-entry-per-slot constraint, a lock that refuses updates, and a network that can
 * drop. `calls` records what was sent, in order.
 */
function fakeServer() {
  const entries = new Map<string, EntryRow>()
  const followups = new Map<string, FollowupRow>()
  const objects = new Map<string, Blob>()
  const attachments = new Map<string, AttachmentRow>()
  const calls: string[] = []
  const state = {
    offline: false,
    /** Lands the next insert but loses its answer, as a dropped connection would. */
    loseNextAnswer: false,
    locked: new Set<string>(),
    refuse: null as { code: string; message: string } | null,
    /** Called before an insert lands, so a test can act while it's "on the wire". */
    beforeInsert: null as (() => Promise<void>) | null,
  }
  /** One hop over the network. */
  const wire = () => Promise.resolve()
  const ok = (rows?: number): ApiResult => ({ error: null, status: 201, rows })
  const down: ApiResult = { error: { message: 'TypeError: Failed to fetch' }, status: 0 }
  const slotOf = (r: Pick<EntryRow, 'assignment_id' | 'date' | 'plan_item_id'>) =>
    `${r.assignment_id}|${r.date}|${r.plan_item_id ?? ''}`

  const api: OutboxApi = {
    async insertEntry(row) {
      calls.push(`insertEntry ${row.id}`)
      if (state.offline) return down
      if (state.beforeInsert) {
        const hook = state.beforeInsert
        state.beforeInsert = null
        await hook()
      }
      if (state.refuse) return { error: state.refuse, status: 400 }
      if (entries.has(row.id)) {
        return {
          error: { code: '23505', message: 'violates unique constraint "entries_pkey"' },
          status: 409,
        }
      }
      if ([...entries.values()].some((e) => slotOf(e) === slotOf(row))) {
        return {
          error: { code: '23505', message: 'violates unique constraint "entries_one_per_slot"' },
          status: 409,
        }
      }
      entries.set(row.id, { ...row })
      if (state.loseNextAnswer) {
        state.loseNextAnswer = false
        return down
      }
      return ok()
    },
    async updateEntry(id, patch) {
      calls.push(`updateEntry ${id}`)
      await wire()
      if (state.offline) return down
      const current = entries.get(id)
      if (!current || state.locked.has(id)) return ok(0)
      entries.set(id, { ...current, ...patch })
      return ok(1)
    },
    async findEntryId(slot) {
      calls.push('findEntryId')
      await wire()
      if (state.offline) return { ...down, id: null }
      const found = [...entries.values()].find((e) => slotOf(e) === slotOf(slot))
      return { ...ok(), id: found?.id ?? null }
    },
    async insertFollowup(row) {
      calls.push(`insertFollowup ${row.id} for ${row.entry_id}`)
      await wire()
      if (state.offline) return down
      if (!entries.has(row.entry_id)) {
        return { error: { code: '23503', message: 'violates foreign key constraint' }, status: 409 }
      }
      followups.set(row.id, { ...row })
      return ok()
    },
    async updateFollowup(id, patch) {
      calls.push(`updateFollowup ${id}`)
      await wire()
      if (state.offline) return down
      const current = followups.get(id)
      if (!current) return ok(0)
      followups.set(id, { ...current, ...patch })
      return ok(1)
    },
    async uploadPhoto(path, blob) {
      calls.push(`uploadPhoto ${path}`)
      await wire()
      if (state.offline) return down
      if (objects.has(path))
        return { error: { message: 'The resource already exists' }, status: 409 }
      objects.set(path, blob)
      if (state.loseNextAnswer) {
        state.loseNextAnswer = false
        return down
      }
      return ok()
    },
    async insertAttachment(row) {
      calls.push(`insertAttachment ${row.id}`)
      await wire()
      if (state.offline) return down
      if (!entries.has(row.entry_id)) {
        return { error: { code: '23503', message: 'violates foreign key constraint' }, status: 409 }
      }
      if (attachments.has(row.id)) {
        return {
          error: { code: '23505', message: 'violates unique constraint "attachments_pkey"' },
          status: 409,
        }
      }
      attachments.set(row.id, row)
      return ok()
    },
    async findAttachment(id) {
      calls.push(`findAttachment ${id}`)
      await wire()
      if (state.offline) return down
      return ok(attachments.has(id) ? 1 : 0)
    },
  }
  return { api, entries, followups, objects, attachments, calls, state }
}

let n = 0
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
let user = ''

const entry = (extra: Partial<EntryRow> = {}): EntryRow => ({
  id: id(),
  assignment_id: 'math',
  plan_item_id: 'session-6',
  field_version: 2,
  date: '2026-11-10',
  data: { minutes: 30 },
  owner_id: user,
  ...extra,
})

const followup = (entryId: string): FollowupRow => ({
  id: id(),
  entry_id: entryId,
  assignment_id: 'math',
  label: 'p. 31 #4',
  due_date: '2026-11-12',
  status: 'open',
  owner_id: user,
})

beforeEach(() => {
  // A fresh user per test keeps each test's ops apart in the shared fake IndexedDB.
  user = id()
})

describe('the outbox', () => {
  it('sends ops in the order they were made, then empties', async () => {
    const server = fakeServer()
    const e = entry()
    const f = followup(e.id)
    await enqueue(user, { kind: 'entry.create', row: e })
    await enqueue(user, { kind: 'followup.create', row: f })

    const result = await flushOutbox(user, server.api)
    expect(result).toEqual({ synced: 2, parked: 0, waiting: 0, offline: false })
    expect(server.calls).toEqual([`insertEntry ${e.id}`, `insertFollowup ${f.id} for ${e.id}`])
    expect(await listOutbox(user)).toEqual([])
  })

  it('keeps everything, in order, while the server is unreachable', async () => {
    const server = fakeServer()
    server.state.offline = true
    const e = entry()
    await enqueue(user, { kind: 'entry.create', row: e })
    await enqueue(user, { kind: 'followup.create', row: followup(e.id) })

    expect((await flushOutbox(user, server.api)).offline).toBe(true)
    expect(await listOutbox(user)).toHaveLength(2)
    expect(server.calls).toHaveLength(1) // stopped at the first failure

    server.state.offline = false
    expect((await flushOutbox(user, server.api)).synced).toBe(2)
    expect(server.entries.size).toBe(1)
  })

  it('folds an edit made before syncing into the waiting op', async () => {
    const server = fakeServer()
    const e = entry()
    await enqueue(user, { kind: 'entry.create', row: e })
    await enqueue(user, { kind: 'entry.update', id: e.id, patch: { data: { minutes: 45 } } })

    const queued = await listOutbox(user)
    expect(queued).toHaveLength(1)
    await flushOutbox(user, server.api)
    expect(server.entries.get(e.id)?.data).toEqual({ minutes: 45 })
    expect(server.calls).toEqual([`insertEntry ${e.id}`])
  })

  it('retries an insert whose answer was lost without making a second row', async () => {
    const server = fakeServer()
    const e = entry()
    server.state.loseNextAnswer = true
    await enqueue(user, { kind: 'entry.create', row: e })

    expect((await flushOutbox(user, server.api)).offline).toBe(true)
    expect(server.entries.size).toBe(1) // it landed
    expect(await listOutbox(user)).toHaveLength(1) // but the device doesn't know yet

    expect((await flushOutbox(user, server.api)).synced).toBe(1)
    expect(server.entries.size).toBe(1)
    expect(server.calls).toEqual([
      `insertEntry ${e.id}`,
      `insertEntry ${e.id}`,
      `updateEntry ${e.id}`,
    ])
    expect(await listOutbox(user)).toEqual([])
  })

  it('keeps an edit made while the insert was on its way, and sends it next', async () => {
    const server = fakeServer()
    const e = entry()
    await enqueue(user, { kind: 'entry.create', row: e })
    server.state.beforeInsert = () =>
      enqueue(user, { kind: 'entry.update', id: e.id, patch: { data: { minutes: 50 } } })

    await flushOutbox(user, server.api)
    expect(server.entries.get(e.id)?.data).toEqual({ minutes: 30 })
    expect(await listOutbox(user)).toHaveLength(1) // not deleted: it changed in flight

    await flushOutbox(user, server.api)
    expect(server.entries.get(e.id)?.data).toEqual({ minutes: 50 })
    expect(await listOutbox(user)).toEqual([])
  })

  it('merges into the row another device already logged for the same session', async () => {
    const server = fakeServer()
    const theirs = entry()
    server.entries.set(theirs.id, theirs)
    const ours = entry({ data: { minutes: 40 } })
    const f = followup(ours.id)
    await enqueue(user, { kind: 'entry.create', row: ours })
    await enqueue(user, { kind: 'followup.create', row: f })

    expect((await flushOutbox(user, server.api)).synced).toBe(2)
    expect(server.entries.size).toBe(1)
    expect(server.entries.get(theirs.id)?.data).toEqual({ minutes: 40 })
    // The followup was pointed at the server's entry.
    expect(server.followups.get(f.id)?.entry_id).toBe(theirs.id)
  })

  it('parks a refused entry with the reason, holds what needs it, and sends the rest', async () => {
    const server = fakeServer()
    const bad = entry()
    const f = followup(bad.id)
    const violin = entry({ assignment_id: 'violin', plan_item_id: null })
    await enqueue(user, { kind: 'entry.create', row: bad })
    await enqueue(user, { kind: 'followup.create', row: f })

    server.state.refuse = {
      code: '23514',
      message: '"Minutes" must be whole minutes between 0 and 1440',
    }
    expect(await flushOutbox(user, server.api)).toMatchObject({ synced: 0, parked: 1, waiting: 1 })
    server.state.refuse = null
    await enqueue(user, { kind: 'entry.create', row: violin })
    expect((await flushOutbox(user, server.api)).synced).toBe(1)

    const queued = await listOutbox(user)
    expect(queued).toHaveLength(2)
    expect(queued[0]?.parked?.reason).toBe(
      'Not accepted: "Minutes" must be whole minutes between 0 and 1440',
    )
    expect(queued[1]?.parked).toBeNull()

    // The student fixes it: the change clears the refusal and both go through.
    await enqueue(user, { kind: 'entry.update', id: bad.id, patch: { data: { minutes: 30 } } })
    expect((await flushOutbox(user, server.api)).synced).toBe(2)
    expect(await listOutbox(user)).toEqual([])
  })

  it('parks an edit the 7-day lock refuses', async () => {
    const server = fakeServer()
    const e = entry()
    server.entries.set(e.id, e)
    server.state.locked.add(e.id)
    await enqueue(user, { kind: 'entry.update', id: e.id, patch: { data: { minutes: 10 } } })

    expect((await flushOutbox(user, server.api)).parked).toBe(1)
    expect((await listOutbox(user))[0]?.parked?.reason).toBe(REASONS.locked)
  })

  it('treats a request without a session as "try later", not a refusal', async () => {
    const server = fakeServer()
    server.state.refuse = { code: '42501', message: 'permission denied for table entries' }
    await enqueue(user, { kind: 'entry.create', row: entry() })
    expect((await flushOutbox(user, server.api)).offline).toBe(true)
    expect((await listOutbox(user))[0]?.parked).toBeNull()
  })

  it('sends only the signed-in user’s ops', async () => {
    const server = fakeServer()
    const other = id()
    await enqueue(other, { kind: 'entry.create', row: entry({ owner_id: other }) })
    await enqueue(user, { kind: 'entry.create', row: entry({ date: '2026-11-12' }) })

    expect((await flushOutbox(user, server.api)).synced).toBe(1)
    expect(await listOutbox(other)).toHaveLength(1)
    expect([...server.entries.values()].map((e) => e.owner_id)).toEqual([user])
  })
})

describe('photos', () => {
  const photo = () => new Blob(['jpeg bytes'], { type: 'image/jpeg' })

  it('upload after their entry, then get their row, then leave the device', async () => {
    const server = fakeServer()
    const e = entry()
    const attachment = id()
    await putPhoto(user, attachment, photo())
    await enqueue(user, { kind: 'entry.create', row: { ...e, data: { notebook: attachment } } })
    await enqueue(user, { kind: 'photo.upload', id: attachment, entry_id: e.id, owner_id: user })

    expect((await flushOutbox(user, server.api)).synced).toBe(2)
    const path = `${user}/${e.id}/${attachment}.jpg`
    expect(server.calls).toEqual([
      `insertEntry ${e.id}`,
      `uploadPhoto ${path}`,
      `insertAttachment ${attachment}`,
    ])
    expect(server.attachments.get(attachment)?.storage_path).toBe(path)
    expect(await getPhoto(attachment)).toBeUndefined()
  })

  it('wait offline, and an upload whose answer was lost isn’t uploaded twice', async () => {
    const server = fakeServer()
    const e = entry()
    server.entries.set(e.id, e)
    const attachment = id()
    await putPhoto(user, attachment, photo())
    await enqueue(user, { kind: 'photo.upload', id: attachment, entry_id: e.id, owner_id: user })

    server.state.loseNextAnswer = true
    expect((await flushOutbox(user, server.api)).offline).toBe(true)
    expect(await getPhoto(attachment)).toBeDefined() // still here
    expect((await flushOutbox(user, server.api)).synced).toBe(1)
    expect(server.objects.size).toBe(1)
    expect(server.attachments.size).toBe(1)
  })

  it('count as done when the device lost the photo after it was saved, and parked when not', async () => {
    const server = fakeServer()
    const e = entry()
    server.entries.set(e.id, e)
    const saved = id()
    server.attachments.set(saved, {
      id: saved,
      entry_id: e.id,
      storage_path: `${user}/${e.id}/${saved}.jpg`,
      kind: 'photo',
      owner_id: user,
    })
    const lost = id()
    await enqueue(user, { kind: 'photo.upload', id: saved, entry_id: e.id, owner_id: user })
    await enqueue(user, { kind: 'photo.upload', id: lost, entry_id: e.id, owner_id: user })

    expect(await flushOutbox(user, server.api)).toMatchObject({ synced: 1, parked: 1 })
    expect((await listOutbox(user))[0]?.parked?.reason).toBe(REASONS.photoGone)
  })

  it('follow their entry when it turns out to be another device’s row', async () => {
    const server = fakeServer()
    const theirs = entry()
    server.entries.set(theirs.id, theirs)
    const ours = entry()
    const attachment = id()
    await putPhoto(user, attachment, photo())
    await enqueue(user, { kind: 'entry.create', row: ours })
    await enqueue(user, { kind: 'photo.upload', id: attachment, entry_id: ours.id, owner_id: user })

    expect((await flushOutbox(user, server.api)).synced).toBe(2)
    expect(server.attachments.get(attachment)?.entry_id).toBe(theirs.id)
  })
})

describe('drafts', () => {
  it('are kept per user, assignment and session, and can be resumed', async () => {
    const key = draftKey(user, 'math', 'session-6', '2026-11-10')
    expect(key).not.toBe(draftKey(user, 'math', 'session-7', '2026-11-10'))
    expect(draftKey(user, 'violin', null, '2026-11-10')).not.toBe(
      draftKey(user, 'violin', null, '2026-11-11'),
    )
    await saveDraft({
      key,
      userId: user,
      assignmentId: 'math',
      planItemId: 'session-6',
      date: '2026-11-10',
      entryId: id(),
      editing: false,
      fieldVersion: 2,
      data: { minutes: 20 },
      step: 3,
      startedAt: '2026-11-10T20:00:00Z',
      updatedAt: '2026-11-10T20:01:00Z',
    })
    expect((await getDraft(key))?.step).toBe(3)
    await deleteDraft(key)
    expect(await getDraft(key)).toBeUndefined()
  })
})
