import { expect, test } from '@playwright/test'
import { ACCOUNTS } from './accounts'
import { createClient } from '@supabase/supabase-js'
import { localEnv, signedInClient } from './supabase'

/**
 * The Data API itself, not the app: what a signed-in user could call with their own
 * token and a script. pgTAP checks the database side (12_api_surface.sql); this checks
 * what PostgREST actually exposes.
 */
test.describe('the Data API', () => {
  test('does not expose the security helpers as RPC endpoints', async () => {
    const client = await signedInClient(ACCOUNTS.student.email)
    const calls = {
      role: {},
      is_admin: {},
      can_see: { student: '00000000-0000-0000-0000-000000000000' },
      admin_mfa_ok: {},
      admin_can_write: {},
    }
    for (const [name, args] of Object.entries(calls)) {
      const { data, error } = (await client.rpc(name, args)) as {
        data: unknown
        error: { code: string } | null
      }
      expect(data, `${name} returned data`).toBeNull()
      // PGRST202: no such function in the exposed schema cache.
      expect(error?.code, `${name} is callable`).toBe('PGRST202')
    }
  })

  test('signs links to the book’s pages for an assigned student, never for a visitor', async () => {
    const student = await signedInClient(ACCOUNTS.student.email)
    const signed = await student.storage
      .from('book-pages')
      .createSignedUrl('singapore-math/031.webp', 600)
    expect(signed.error).toBeNull()
    expect((await fetch(signed.data?.signedUrl ?? '')).status).toBe(200)

    const { url, key } = localEnv()
    const visitor = createClient(url, key, { auth: { persistSession: false } })
    const refused = await visitor.storage
      .from('book-pages')
      .createSignedUrl('singapore-math/031.webp', 600)
    expect(refused.data).toBeNull()
    expect(refused.error).not.toBeNull()
    const listed = await visitor.storage.from('book-pages').list('singapore-math')
    expect(listed.data ?? []).toEqual([])
  })
})
