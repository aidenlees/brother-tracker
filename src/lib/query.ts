/**
 * Server data, cached on the device so screens open offline (CLAUDE.md: "Works
 * offline"). Queries run "offline first": a cached answer shows at once, and a refetch
 * waits for the network instead of failing. The cache lives in IndexedDB for up to 30
 * days and is cleared on sign-out. Every query key starts with the signed-in user's id,
 * so one person's cache is never read as another's.
 */
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { QueryClient } from '@tanstack/react-query'
import { del, get, set } from 'idb-keyval'

export const CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000

/** Bump when a cached query's shape changes, so old caches are dropped rather than misread. */
export const CACHE_VERSION = '1'

export const queryClient = new QueryClient({
  defaultOptions: {
    // gcTime must not be CACHE_MAX_AGE: 30 days is past setTimeout's limit (about 24.8
    // days), so the timer fires at once and every query nothing is showing is dropped,
    // including the ones just restored from the device. Never collecting is fine here:
    // one person's data, and the persisted copy still expires after CACHE_MAX_AGE.
    queries: { staleTime: 30_000, retry: 1, gcTime: Infinity, networkMode: 'offlineFirst' },
    mutations: { networkMode: 'offlineFirst' },
  },
})

export const persister = createAsyncStoragePersister({
  key: 'practice-tracker:query-cache',
  // Written almost at once, so closing the app right after a screen loads still keeps it.
  throttleTime: 100,
  storage: {
    getItem: async (key) => (await get<string>(key)) ?? null,
    setItem: (key, value: string) => set(key, value),
    removeItem: (key) => del(key),
  },
})
