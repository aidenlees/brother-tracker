import { describe, expect, it } from 'vitest'
import { identityCache, isUnreachable, storedSessionUserId } from './identity'

function memoryStorage() {
  const items = new Map<string, string>()
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value)
    },
    removeItem: (key: string) => {
      items.delete(key)
    },
    items,
  }
}

const profile = { id: 'u1', role: 'student' as const, display_name: 'Sam', active: true }

describe('identityCache', () => {
  it('keeps only the four profile fields, and forgets them on clear', () => {
    const storage = memoryStorage()
    identityCache.write({ ...profile, extra: 'x' } as typeof profile, storage)
    expect(identityCache.read(storage)).toEqual(profile)
    expect([...storage.items.values()][0]).not.toContain('extra')
    identityCache.clear(storage)
    expect(identityCache.read(storage)).toBeNull()
  })

  it('ignores anything malformed, an unknown role or a turned-off account', () => {
    const storage = memoryStorage()
    storage.setItem('practice-tracker:identity:v1', 'not json')
    expect(identityCache.read(storage)).toBeNull()
    identityCache.write({ ...profile, role: 'owner' } as unknown as typeof profile, storage)
    expect(identityCache.read(storage)).toBeNull()
    identityCache.write({ ...profile, active: false }, storage)
    expect(identityCache.read(storage)).toBeNull()
  })
})

describe('isUnreachable', () => {
  it('is true when the request never completed or the server failed', () => {
    expect(isUnreachable({ name: 'AuthRetryableFetchError', message: 'x' })).toBe(true)
    expect(isUnreachable({ message: 'TypeError: Failed to fetch', code: '' }, 0)).toBe(true)
    expect(isUnreachable({ message: 'TypeError: Load failed' })).toBe(true)
    expect(isUnreachable({ message: 'upstream' }, 503)).toBe(true)
  })

  it('is false when the server answered no', () => {
    expect(isUnreachable({ message: 'permission denied', code: '42501' }, 403)).toBe(false)
    expect(isUnreachable({ name: 'AuthApiError', message: 'Invalid Refresh Token' }, 400)).toBe(
      false,
    )
    expect(isUnreachable(null)).toBe(false)
  })
})

describe('storedSessionUserId', () => {
  it('reads the user id from a stored session, and nothing from anything else', () => {
    const storage = memoryStorage()
    expect(storedSessionUserId(storage, 'k')).toBeNull()
    storage.setItem('k', JSON.stringify({ access_token: 'x', user: { id: 'u1' } }))
    expect(storedSessionUserId(storage, 'k')).toBe('u1')
    storage.setItem('k', '{broken')
    expect(storedSessionUserId(storage, 'k')).toBeNull()
  })
})
