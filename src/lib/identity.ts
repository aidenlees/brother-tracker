/**
 * Staying signed in without a connection (CLAUDE.md: "Works offline").
 *
 * A student signs in once per device. After that, opening the app with no network must
 * still show their screens. Supabase keeps the session in storage, but while it can't
 * refresh an expired access token it reports "no session", and the profile query can't
 * run. So the app remembers the last profile the server confirmed for this device and
 * uses it, and only that, when the server can't be reached. A real answer from the
 * server (no profile, account turned off, session revoked) always wins.
 */
import type { SignedInProfile } from './auth-context'

const KEY = 'practice-tracker:identity:v1'

/** The last profile the server confirmed on this device. Cleared on sign-out. */
export const identityCache = {
  read(storage: Pick<Storage, 'getItem'> = localStorage): SignedInProfile | null {
    try {
      const raw = storage.getItem(KEY)
      if (!raw) return null
      const value = JSON.parse(raw) as Partial<SignedInProfile>
      const roles: readonly unknown[] = ['student', 'admin', 'viewer']
      if (
        typeof value.id === 'string' &&
        roles.includes(value.role) &&
        typeof value.display_name === 'string' &&
        value.active === true
      ) {
        return value as SignedInProfile
      }
      return null
    } catch {
      return null
    }
  },
  write(profile: SignedInProfile, storage: Pick<Storage, 'setItem'> = localStorage): void {
    const { id, role, display_name, active } = profile
    storage.setItem(KEY, JSON.stringify({ id, role, display_name, active }))
  },
  clear(storage: Pick<Storage, 'removeItem'> = localStorage): void {
    storage.removeItem(KEY)
  },
}

/**
 * True when an error means "couldn't reach the server", not "the server said no":
 * supabase-js's retryable auth fetch errors, and PostgREST results with status 0
 * (the request never completed) or 5xx.
 */
export function isUnreachable(error: unknown, status?: number): boolean {
  if (status !== undefined && (status === 0 || status >= 500)) return true
  if (typeof error !== 'object' || error === null) return false
  const { name, message } = error as { name?: unknown; message?: unknown }
  if (name === 'AuthRetryableFetchError') return true
  return (
    typeof message === 'string' &&
    /Failed to fetch|NetworkError|Load failed|fetch failed|ERR_INTERNET_DISCONNECTED/i.test(message)
  )
}

/** The user id of the session supabase-js has stored, read straight from storage (no network). */
export function storedSessionUserId(storage: Pick<Storage, 'getItem'>, key: string): string | null {
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const id = (JSON.parse(raw) as { user?: { id?: unknown } }).user?.id
    return typeof id === 'string' ? id : null
  } catch {
    return null
  }
}
