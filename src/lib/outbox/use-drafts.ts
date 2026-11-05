import { useEffect, useState } from 'react'
import { listDrafts, subscribe } from './store'
import type { Draft } from './types'

/** The user's logs in progress on this device, kept current as they change. */
export function useDrafts(userId: string): Draft[] {
  const [drafts, setDrafts] = useState<Draft[]>([])
  useEffect(() => {
    let current = true
    const load = () => {
      void listDrafts(userId).then((next) => {
        if (current) setDrafts(next)
      })
    }
    load()
    const unsubscribe = subscribe(load)
    return () => {
      current = false
      unsubscribe()
    }
  }, [userId])
  return drafts
}
