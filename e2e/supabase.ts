import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { PASSWORD } from './accounts'

/** The local stack's public URL and publishable key, from .env.local (pnpm env:local). */
export function localEnv(): { url: string; key: string } {
  const text = readFileSync(resolve(import.meta.dirname, '..', '.env.local'), 'utf8')
  const value = (name: string) => {
    const match = new RegExp(`^${name}=(.+)$`, 'm').exec(text)
    if (!match?.[1]) throw new Error(`.env.local has no ${name}. Run pnpm env:local.`)
    return match[1].trim()
  }
  return { url: value('VITE_SUPABASE_URL'), key: value('VITE_SUPABASE_PUBLISHABLE_KEY') }
}

/**
 * A Supabase client signed in as one of the fake local accounts, for checks that go
 * straight to the API rather than through the app. Uses the publishable key only, so
 * RLS applies exactly as it does in the browser.
 */
export async function signedInClient(email: string): Promise<SupabaseClient> {
  const { url, key } = localEnv()
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw error
  return client
}

/** Where supabase-js keeps the session in the browser (its default name). */
export function authStorageKey(): string {
  return `sb-${new URL(localEnv().url).hostname.split('.')[0] ?? 'local'}-auth-token`
}

/**
 * Runs SQL as postgres on the LOCAL stack (the Supabase CLI targets it by default and
 * this never passes --remote). Only for setting up states a user can't create, such as
 * an entry that was logged more than 7 days ago.
 */
export function localSql(sql: string): void {
  const root = resolve(import.meta.dirname, '..')
  const cli = join(
    dirname(createRequire(import.meta.url).resolve('supabase/package.json')),
    'dist',
    'supabase.js',
  )
  const result = spawnSync(process.execPath, [cli, 'db', 'query', sql], {
    cwd: root,
    encoding: 'utf8',
  })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
}
