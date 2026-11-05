import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'
import type { Profile, Role } from './supabase'

export type SignedInProfile = Profile & { role: Role }

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out'; notice?: string }
  /** Password accepted; this account has TOTP and the session still needs the code. */
  | { status: 'needs-code'; session: Session }
  | { status: 'signed-in'; session: Session; profile: SignedInProfile }

export type SignInResult = { ok: true } | { ok: false; message: string }

export type Auth = AuthState & {
  signIn: (email: string, password: string) => Promise<SignInResult>
  verifyCode: (code: string) => Promise<SignInResult>
  signOut: () => Promise<void>
}

export const NOTICES = {
  notSetUp: 'This account isn’t set up yet. Ask your admin to finish setting it up.',
  turnedOff: 'This account is turned off. Ask your admin if that’s a mistake.',
} as const

export const AuthContext = createContext<Auth | null>(null)

export function useAuth(): Auth {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>')
  return auth
}
