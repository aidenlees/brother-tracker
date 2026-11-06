import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { getEnv } from './env'

const env = getEnv()

/**
 * Where supabase-js keeps the session: its own default name, spelled out so sign-out can
 * remove it even when supabase-js can't (offline with an expired token, it returns early
 * and leaves the session behind).
 */
export const AUTH_STORAGE_KEY = `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0] ?? 'local'}-auth-token`

/**
 * The one Supabase client. It holds only the publishable key; every row it can read
 * or write is decided by RLS in the database (CLAUDE.md, security rules).
 * Sessions persist in this browser and refresh themselves, so a student signs in once
 * per device.
 */
export const supabase = createClient<Database>(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: AUTH_STORAGE_KEY,
      // The app sends no auth email, so no session ever arrives in a URL.
      detectSessionInUrl: false,
    },
  },
)

export type Profile = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'role' | 'display_name' | 'active'
>
export type Role = 'student' | 'admin' | 'viewer'
