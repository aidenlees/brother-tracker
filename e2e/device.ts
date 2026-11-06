import { expect, type Page } from '@playwright/test'

/** Today's queries, by the second part of their key ([userId, name, …]). */
const TODAY_QUERIES = ['assignments', 'plan-items', 'entries', 'followups']

/** The few IndexedDB shapes used below (this project compiles e2e/ without the DOM types). */
type Request<T> = { result: T; onsuccess: (() => void) | null; onerror: (() => void) | null }
type Database = {
  objectStoreNames: { contains: (name: string) => boolean }
  transaction: (store: string) => {
    objectStore: (name: string) => { get: (key: string) => Request<unknown> }
  }
  close: () => void
}
type OpenRequest = Request<Database> & {
  transaction: { abort: () => void } | null
  onupgradeneeded: (() => void) | null
}
type Browser = { indexedDB: { open: (name: string) => OpenRequest } }

/** The queries in the copy of the server data kept on the device, by name. */
function keptQueries(page: Page): Promise<unknown[]> {
  return page.evaluate(async () => {
    const { indexedDB } = globalThis as unknown as Browser
    const raw = await new Promise<unknown>((resolve) => {
      const open = indexedDB.open('keyval-store')
      // Not written yet: don't create the database here, or idb-keyval can't add its store.
      open.onupgradeneeded = () => {
        open.transaction?.abort()
      }
      open.onerror = () => {
        resolve(undefined)
      }
      open.onsuccess = () => {
        const db = open.result
        if (!db.objectStoreNames.contains('keyval')) {
          db.close()
          resolve(undefined)
          return
        }
        const get = db
          .transaction('keyval')
          .objectStore('keyval')
          .get('practice-tracker:query-cache')
        get.onsuccess = () => {
          db.close()
          resolve(get.result)
        }
        get.onerror = () => {
          db.close()
          resolve(undefined)
        }
      }
    })
    if (typeof raw !== 'string') return []
    const { clientState } = JSON.parse(raw) as {
      clientState: { queries: { queryKey: unknown[]; state: { status: string } }[] }
    }
    return clientState.queries.filter((q) => q.state.status === 'success').map((q) => q.queryKey[1])
  })
}

/**
 * Waits until the copy of the server data kept on the device (the persisted query
 * cache, src/lib/query.ts) holds every query Today needs. The app writes that copy a
 * moment after each change, so a test that reloads offline straight after the data
 * shows up could otherwise reload before the last write, which no student does.
 */
export async function keptOnDevice(page: Page): Promise<void> {
  await expect
    .poll(() => keptQueries(page), { message: 'Today’s data kept on the device' })
    .toEqual(expect.arrayContaining(TODAY_QUERIES))
}
