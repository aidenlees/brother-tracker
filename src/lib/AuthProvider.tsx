import type { AuthError, Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthContext, NOTICES, type Auth, type AuthState, type SignInResult } from './auth-context'
import { supabase, type Role } from './supabase'

const ROLES: readonly string[] = ['student', 'admin', 'viewer'] satisfies Role[]

function describe(error: AuthError): string {
  if (error.code === 'invalid_credentials') return 'That email and password don’t match an account.'
  if (error.status === 429) return 'Too many tries. Wait a minute, then try again.'
  if (error.code === 'mfa_verification_failed') {
    return 'That code didn’t work. Check the app and try again.'
  }
  if (error.name === 'AuthRetryableFetchError') {
    return 'Couldn’t reach the server. Check your connection and try again.'
  }
  return error.message
}

/** The session's assurance level, read from its JWT (no network call). */
function aalOf(session: Session): string {
  try {
    const payload = session.access_token.split('.')[1] ?? ''
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      aal?: string
    }
    return claims.aal ?? 'aal1'
  } catch {
    return 'aal1'
  }
}

type Resolved =
  | { kind: 'needs-code' }
  | { kind: 'profile'; profile: Extract<AuthState, { status: 'signed-in' }>['profile'] }
  | { kind: 'refused'; notice: string }

/** What a session may see: the code step, the app, or nothing (with the reason). */
async function resolve(session: Session): Promise<Resolved> {
  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
    return { kind: 'needs-code' }
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, role, display_name, active')
    .eq('id', session.user.id)
    .maybeSingle()
  if (error) throw error

  if (!profile || !ROLES.includes(profile.role))
    return { kind: 'refused', notice: NOTICES.notSetUp }
  if (!profile.active) return { kind: 'refused', notice: NOTICES.turnedOff }
  return { kind: 'profile', profile: { ...profile, role: profile.role as Role } }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  /** undefined until the stored session has been read; null when signed out. */
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [resolved, setResolved] = useState<{ identity: string; result: Resolved } | null>(null)
  const [notice, setNotice] = useState<string | undefined>(undefined)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })
    // Keep this callback synchronous: calling Supabase from inside it can deadlock.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => {
      data.subscription.unsubscribe()
    }
  }, [])

  // Resolve again only when the user or their assurance level changes, not on every
  // hourly token refresh.
  const identity = session ? `${session.user.id}:${aalOf(session)}` : null

  useEffect(() => {
    if (!session || !identity) return
    let current = true
    resolve(session)
      .then(async (result) => {
        if (!current) return
        if (result.kind === 'refused') {
          setNotice(result.notice)
          await supabase.auth.signOut({ scope: 'local' })
          return
        }
        setResolved({ identity, result })
      })
      .catch(async () => {
        if (!current) return
        setNotice('Couldn’t load your account. Check your connection and sign in again.')
        await supabase.auth.signOut({ scope: 'local' })
      })
    return () => {
      current = false
    }
    // `session` changes on every token refresh; `identity` captures what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity])

  const state: AuthState = useMemo(() => {
    if (session === undefined) return { status: 'loading' }
    if (session === null)
      return notice ? { status: 'signed-out', notice } : { status: 'signed-out' }
    if (resolved?.identity !== identity) return { status: 'loading' }
    return resolved.result.kind === 'needs-code'
      ? { status: 'needs-code', session }
      : resolved.result.kind === 'profile'
        ? { status: 'signed-in', session, profile: resolved.result.profile }
        : { status: 'loading' }
  }, [session, identity, resolved, notice])

  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    setNotice(undefined)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? { ok: false, message: describe(error) } : { ok: true }
  }, [])

  const verifyCode = useCallback(async (code: string): Promise<SignInResult> => {
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
    if (listError) return { ok: false, message: describe(listError) }
    const factor = factors.totp[0]
    if (!factor) return { ok: false, message: 'This account has no authenticator app set up.' }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
    return error ? { ok: false, message: describe(error) } : { ok: true }
  }, [])

  const signOut = useCallback(async () => {
    setNotice(undefined)
    await supabase.auth.signOut({ scope: 'local' })
  }, [])

  const value = useMemo<Auth>(
    () => ({ ...state, signIn, verifyCode, signOut }),
    [state, signIn, verifyCode, signOut],
  )
  return <AuthContext value={value}>{children}</AuthContext>
}
