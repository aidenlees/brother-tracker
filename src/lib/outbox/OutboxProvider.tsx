import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PhotoStoreContext } from '@/trackers/fields/photo-store'
import { supabaseOutboxApi } from './api'
import { OutboxContext, type Outbox } from './outbox-context'
import { devicePhotoStore } from './photos'
import { discardItem, enqueue as enqueueOp, listOutbox, subscribe } from './store'
import { flushOutbox, type OutboxApi } from './sync'
import type { Op, OutboxItem } from './types'

/** What the waiting ops are, so a pass that changed nothing isn't repeated until they change. */
const signature = (items: OutboxItem[]) =>
  items
    .filter((item) => !item.parked)
    .map((item) => `${item.key}=${JSON.stringify(item.op)}`)
    .join('|')

/** After n failed passes in a row: 5 s, 10 s, 20 s ... up to 5 minutes. */
const backoff = (failures: number) => Math.min(5 * 60_000, 5_000 * 2 ** Math.max(0, failures - 1))

/**
 * Sends the signed-in user's outbox whenever there is something to send and a session
 * to send it with: soon after each save, when the browser comes back online or the tab
 * comes back into view, and on a backoff while the server can't be reached.
 */
export function OutboxProvider({
  userId,
  canSync,
  api = supabaseOutboxApi,
  children,
}: {
  userId: string
  /** False while signed in offline without a usable session: nothing could be sent. */
  canSync: boolean
  api?: OutboxApi
  children: ReactNode
}) {
  const queryClient = useQueryClient()
  const [items, setItems] = useState<OutboxItem[]>([])
  const [syncing, setSyncing] = useState(false)
  const [offline, setOffline] = useState(false)
  const [syncedAt, setSyncedAt] = useState<number | null>(null)
  const [stuck, setStuck] = useState<string | null>(null)
  const [round, setRound] = useState(0)
  const failures = useRef(0)
  const running = useRef(false)
  const latest = useRef({ userId, canSync, api })

  useEffect(() => {
    latest.current = { userId, canSync, api }
  }, [userId, canSync, api])

  useEffect(() => {
    let current = true
    const reload = () => {
      void listOutbox(userId).then((next) => {
        if (current) setItems(next)
      })
    }
    reload()
    const unsubscribe = subscribe(reload)
    return () => {
      current = false
      unsubscribe()
    }
  }, [userId])

  const flush = useCallback(() => {
    const { userId: user, canSync: able, api: calls } = latest.current
    if (!able || running.current) return
    running.current = true
    setSyncing(true)
    void flushOutbox(user, calls)
      .then(async (result) => {
        failures.current = result.offline ? failures.current + 1 : 0
        setOffline(result.offline)
        if (!result.offline) setSyncedAt(Date.now())
        // Nothing moved and the server answered: wait for the ops to change.
        if (!result.offline && result.synced === 0 && result.parked === 0) {
          setStuck(signature(await listOutbox(user)))
        }
        if (result.synced > 0) await queryClient.invalidateQueries({ queryKey: [user] })
      })
      .catch(() => {
        failures.current += 1
        setOffline(true)
      })
      .finally(() => {
        running.current = false
        setSyncing(false)
        setRound((n) => n + 1)
      })
  }, [queryClient])

  const waiting = useMemo(() => signature(items), [items])
  const pending = items.filter((item) => !item.parked).length

  // Schedule the next pass whenever there is something to send.
  useEffect(() => {
    if (!canSync || pending === 0 || waiting === stuck) return
    const timer = window.setTimeout(flush, offline ? backoff(failures.current) : 250)
    return () => {
      window.clearTimeout(timer)
    }
  }, [canSync, pending, waiting, stuck, offline, round, flush])

  useEffect(() => {
    const now = () => {
      failures.current = 0
      setOffline(false)
      setStuck(null)
      flush()
    }
    const visible = () => {
      if (document.visibilityState === 'visible') flush()
    }
    window.addEventListener('online', now)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.removeEventListener('online', now)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [flush])

  const enqueue = useCallback(
    async (op: Op) => {
      await enqueueOp(userId, op)
    },
    [userId],
  )

  const value = useMemo<Outbox>(
    () => ({
      userId,
      items,
      pending,
      parked: items.filter((item) => item.parked),
      syncing,
      offline,
      syncedAt,
      enqueue,
      flush,
      discard: discardItem,
    }),
    [userId, items, pending, syncing, offline, syncedAt, enqueue, flush],
  )
  const photos = useMemo(() => devicePhotoStore(userId), [userId])
  return (
    <OutboxContext value={value}>
      <PhotoStoreContext value={photos}>{children}</PhotoStoreContext>
    </OutboxContext>
  )
}
