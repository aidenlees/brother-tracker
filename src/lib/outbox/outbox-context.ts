import { createContext, useContext } from 'react'
import type { Op, OutboxItem } from './types'

export type Outbox = {
  userId: string
  /** This user's ops still on the device, oldest first. */
  items: OutboxItem[]
  /** Waiting to be sent. */
  pending: number
  /** Refused by the server, with reasons; kept until changed or discarded. */
  parked: OutboxItem[]
  syncing: boolean
  /** The last pass couldn't reach the server. */
  offline: boolean
  /** When a pass last finished with the server reachable. */
  syncedAt: number | null
  enqueue: (op: Op) => Promise<void>
  flush: () => void
  discard: (key: string) => Promise<void>
}

export const OutboxContext = createContext<Outbox | null>(null)

export function useOutbox(): Outbox {
  const outbox = useContext(OutboxContext)
  if (!outbox) throw new Error('useOutbox must be used inside <OutboxProvider>')
  return outbox
}
