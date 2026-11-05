import { describe, expect, it } from 'vitest'
import { parseEnv } from './env'

describe('parseEnv', () => {
  it('accepts a URL and a publishable key', () => {
    const env = parseEnv({
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
    })
    expect(env.VITE_SUPABASE_URL).toBe('http://127.0.0.1:54321')
  })

  it('rejects a legacy JWT key, so only the publishable key can ship', () => {
    expect(() =>
      parseEnv({
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'eyJhbGciOiJIUzI1NiJ9.e30.signature',
      }),
    ).toThrow(/publishable key/)
  })

  it('names the missing variables', () => {
    expect(() => parseEnv({})).toThrow(/VITE_SUPABASE_URL/)
  })
})
