import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { getEnv } from './env'

const env = getEnv()

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
