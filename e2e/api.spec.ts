import { expect, test } from '@playwright/test'
import { ACCOUNTS } from './accounts'
import { signedInClient } from './supabase'

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
})
