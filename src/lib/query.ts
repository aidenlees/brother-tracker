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
    queries: { staleTime: 30_000, retry: 1, gcTime: CACHE_MAX_AGE, networkMode: 'offlineFirst' },
    mutations: { networkMode: 'offlineFirst' },
  },
})

export const persister = createAsyncStoragePersister({
  key: 'practice-tracker:query-cache',
  throttleTime: 1000,
  storage: {
    getItem: async (key) => (await get<string>(key)) ?? null,
    setItem: (key, value: string) => set(key, value),
    removeItem: (key) => del(key),
  },
})
