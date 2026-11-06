import { describe, expect, it } from 'vitest'
import { isEditable, overlayEntries, overlayFollowups } from './overlay'
import type { OutboxItem } from './types'

const server = {
  id: 'e1',
  assignment_id: 'math',
  plan_item_id: 's5',
  field_version: 2,
  date: '2026-11-08',
  data: { minutes: 30 },
  created_at: '2026-11-08T22:00:00Z',
}

const queued = (op: OutboxItem['op'], parked?: string): OutboxItem => ({
  key: `u:${Math.random()}`,
  userId: 'u',
  op,
  queuedAt: '2026-11-10T20:00:00Z',
  parked: parked ? { reason: parked, at: '2026-11-10T20:01:00Z' } : null,
})

describe('overlayEntries', () => {
  it('shows server rows as synced', () => {
    expect(overlayEntries([server], [])).toEqual([{ ...server, sync: 'synced' }])
  })

  it('adds a new entry at once, as not yet on the server', () => {
    const row = { ...server, id: 'e2', plan_item_id: 's6', date: '2026-11-10', owner_id: 'u' }
    const [, added] = overlayEntries([server], [queued({ kind: 'entry.create', row })])
    expect(added).toMatchObject({ id: 'e2', created_at: null, sync: 'pending' })
    expect(added).not.toHaveProperty('owner_id')
  })

  it('lays an unsynced edit over the server row, keeping its age', () => {
    const [entry] = overlayEntries(
      [server],
      [queued({ kind: 'entry.update', id: 'e1', patch: { data: { minutes: 45 } } }, 'Locked')],
    )
    expect(entry).toMatchObject({
      data: { minutes: 45 },
      created_at: server.created_at,
      sync: 'parked',
      reason: 'Locked',
    })
  })

  it('shows one entry per session when another device logged the same one', () => {
    const row = { ...server, id: 'mine', data: { minutes: 50 }, owner_id: 'u' }
    const shown = overlayEntries([server], [queued({ kind: 'entry.create', row })])
    expect(shown.map((e) => e.id)).toEqual(['mine'])
  })
})

describe('overlayFollowups', () => {
  it('shows a status change at once', () => {
    const followup = {
      id: 'f1',
      entry_id: 'e1',
      assignment_id: 'math',
      label: 'p. 30 #2',
      due_date: '2026-11-10',
      status: 'open' as const,
      created_at: '2026-11-08T22:00:00Z',
    }
    const [shown] = overlayFollowups(
      [followup],
      [queued({ kind: 'followup.update', id: 'f1', patch: { status: 'done' } })],
    )
    expect(shown).toMatchObject({ status: 'done', sync: 'pending' })
  })
})

describe('isEditable', () => {
  const now = Date.parse('2026-11-15T21:00:00Z')
  it('allows changes for 7 days after logging, and always before the server has it', () => {
    expect(isEditable({ created_at: '2026-11-08T22:00:00Z' }, now)).toBe(true)
    expect(isEditable({ created_at: '2026-11-08T20:59:00Z' }, now)).toBe(false)
    expect(isEditable({ created_at: null }, now)).toBe(true)
  })
})
