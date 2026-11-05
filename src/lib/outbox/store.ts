/**
 * IndexedDB for the outbox and drafts. Every change to the outbox runs under one lock
 * (Web Locks across tabs, a promise chain within a tab), and listeners hear about it,
 * in this tab and others.
 */
import { createStore, del, entries, get, set, type UseStore } from 'idb-keyval'
import type { Draft, Op, OutboxItem } from './types'

const OUTBOX_LOCK = 'practice-tracker-outbox'
const FLUSH_LOCK = 'practice-tracker-outbox-flush'

let outboxDb: UseStore | null = null
let draftsDb: UseStore | null = null
const outbox = () => (outboxDb ??= createStore('practice-tracker-outbox', 'items'))
const drafts = () => (draftsDb ??= createStore('practice-tracker-drafts', 'drafts'))

// Locking -------------------------------------------------------------------------

let chain: Promise<unknown> = Promise.resolve()

let flushChain: Promise<unknown> = Promise.resolve()

function exclusive<T>(name: string, task: () => Promise<T>, tail: 'store' | 'flush'): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  const run = locks ? () => locks.request(name, task) : task
  const previous = tail === 'store' ? chain : flushChain
  const next = previous.then(run, run)
  const settled = next.catch(() => undefined)
  if (tail === 'store') chain = settled
  else flushChain = settled
  return next
}

/** Runs `task` alone: no other outbox change in any tab runs at the same time. */
export function withOutboxLock<T>(task: () => Promise<T>): Promise<T> {
  return exclusive(OUTBOX_LOCK, task, 'store')
}

/**
 * One sync pass at a time across tabs. Separate from the store lock, which each step
 * of a pass takes briefly, so a pass never blocks the student saving.
 */
export function withFlushLock<T>(task: () => Promise<T>): Promise<T> {
  return exclusive(FLUSH_LOCK, task, 'flush')
}

// Change notices ------------------------------------------------------------------

const listeners = new Set<() => void>()
const channel =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('practice-tracker-outbox')
channel?.addEventListener('message', () => {
  for (const listener of listeners) listener()
})

function changed() {
  for (const listener of listeners) listener()
  channel?.postMessage('changed')
}

/** Calls `listener` after any outbox or draft change, here or in another tab. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// The outbox ----------------------------------------------------------------------

let counter = 0
function nextKey(userId: string): string {
  counter = (counter + 1) % 1_000_000
  return `${userId}:${String(Date.now()).padStart(15, '0')}:${String(counter).padStart(6, '0')}`
}

/** This user's ops, oldest first. */
export async function listOutbox(userId: string): Promise<OutboxItem[]> {
  const all = await entries<string, OutboxItem>(outbox())
  return all
    .map(([, item]) => item)
    .filter((item) => item.userId === userId)
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

export function getItem(key: string): Promise<OutboxItem | undefined> {
  return get<OutboxItem>(key, outbox())
}

/**
 * Adds an op. A change to something still waiting is folded into the op already
 * queued for it (and clears a refusal, since the student has changed it), so the
 * server sees one write with the latest data.
 */
export function enqueue(userId: string, op: Op): Promise<void> {
  return withOutboxLock(async () => {
    const queued = await listOutbox(userId)
    const merged = fold(queued, op)
    if (merged) {
      await set(merged.key, { ...merged, parked: null }, outbox())
    } else {
      const key = nextKey(userId)
      const item: OutboxItem = { key, userId, op, queuedAt: new Date().toISOString(), parked: null }
      await set(key, item, outbox())
    }
    changed()
  })
}

/** The queued item `op` folds into, already updated, or null to append it. */
function fold(queued: OutboxItem[], op: Op): OutboxItem | null {
  for (const item of queued) {
    const held = item.op
    if (op.kind === 'entry.update') {
      if (held.kind === 'entry.create' && held.row.id === op.id) {
        return { ...item, op: { ...held, row: { ...held.row, ...op.patch } } }
      }
      if (held.kind === 'entry.update' && held.id === op.id) {
        return { ...item, op: { ...held, patch: { ...held.patch, ...op.patch } } }
      }
    }
    if (op.kind === 'followup.update') {
      if (held.kind === 'followup.create' && held.row.id === op.id) {
        return { ...item, op: { ...held, row: { ...held.row, ...op.patch } } }
      }
      if (held.kind === 'followup.update' && held.id === op.id) {
        return { ...item, op: { ...held, patch: { ...held.patch, ...op.patch } } }
      }
    }
    if (op.kind === 'entry.create' && held.kind === 'entry.create' && held.row.id === op.row.id) {
      return { ...item, op }
    }
    if (
      op.kind === 'followup.create' &&
      held.kind === 'followup.create' &&
      held.row.id === op.row.id
    ) {
      return { ...item, op }
    }
  }
  return null
}

const same = (a: Op, b: Op) => JSON.stringify(a) === JSON.stringify(b)

/**
 * The server has `sent`: delete it, unless the student changed the op while it was on
 * its way. Then it stays, now holding newer data, and the next pass sends that.
 */
export function completeItem(key: string, sent: Op): Promise<void> {
  return withOutboxLock(async () => {
    const item = await getItem(key)
    if (!item || !same(item.op, sent)) return
    await del(key, outbox())
    changed()
  })
}

/** The server refused `sent`: keep it with the reason (unless it has changed since). */
export function parkItem(key: string, sent: Op, reason: string): Promise<void> {
  return withOutboxLock(async () => {
    const item = await getItem(key)
    if (!item || !same(item.op, sent)) return
    await set(key, { ...item, parked: { reason, at: new Date().toISOString() } }, outbox())
    changed()
  })
}

/** Removes an op outright: the student chose to discard a refused change. */
export function discardItem(key: string): Promise<void> {
  return withOutboxLock(async () => {
    await del(key, outbox())
    changed()
  })
}

/**
 * The server already had this entry under another id (logged on another device), so
 * point every later op at the server's id.
 */
export function remapEntry(userId: string, from: string, to: string): Promise<void> {
  return withOutboxLock(async () => {
    for (const item of await listOutbox(userId)) {
      const op = item.op
      let next: Op | null = null
      if (op.kind === 'entry.update' && op.id === from) next = { ...op, id: to }
      if (op.kind === 'followup.create' && op.row.entry_id === from) {
        next = { ...op, row: { ...op.row, entry_id: to } }
      }
      if (next) await set(item.key, { ...item, op: next }, outbox())
    }
    changed()
  })
}

// Drafts --------------------------------------------------------------------------

/** One draft per student, assignment and session (or day, for daily trackers). */
export function draftKey(
  userId: string,
  assignmentId: string,
  planItemId: string | null,
  date: string,
): string {
  return `${userId}:${assignmentId}:${planItemId ?? `day:${date}`}`
}

export function getDraft(key: string): Promise<Draft | undefined> {
  return get<Draft>(key, drafts())
}

export async function saveDraft(draft: Draft): Promise<void> {
  await set(draft.key, draft, drafts())
  changed()
}

export async function deleteDraft(key: string): Promise<void> {
  await del(key, drafts())
  changed()
}

export async function listDrafts(userId: string): Promise<Draft[]> {
  const all = await entries<string, Draft>(drafts())
  return all.map(([, draft]) => draft).filter((draft) => draft.userId === userId)
}
