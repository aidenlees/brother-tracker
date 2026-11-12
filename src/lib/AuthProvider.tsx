import type { AuthError, Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AuthContext,
  NOTICES,
  type Auth,
  type AuthState,
  type SignedInProfile,
  type SignInResult,
} from './auth-context'
import { identityCache, isUnreachable, storedSessionUserId } from './identity'
import { AUTH_STORAGE_KEY, supabase, type Role } from './supabase'

const ROLES: readonly string[] = ['student', 'admin', 'viewer'] satisfies Role[]

function describe(error: AuthError): string {
  if (error.code === 'invalid_credentials') return 'That email and password don’t match an account.'
  if (error.code === 'user_banned') return 'This account is turned off. Ask your admin.'
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
  | { kind: 'profile'; profile: SignedInProfile; offline: boolean }
  | { kind: 'refused'; notice: string }
  | { kind: 'unreachable' }

/** What a session may see: the code step, the app, nothing (with the reason), or "ask again later". */
async function resolve(session: Session): Promise<Resolved> {
  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
    return { kind: 'needs-code' }
  }

  const {
    data: profile,
    error,
    status,
  } = await supabase
    .from('profiles')
    .select('id, role, display_name, active')
    .eq('id', session.user.id)
    .maybeSingle()
  if (error) {
    if (isUnreachable(error, status)) return { kind: 'unreachable' }
    throw error
  }

  if (!profile || !ROLES.includes(profile.role))
    return { kind: 'refused', notice: NOTICES.notSetUp }
  if (!profile.active) return { kind: 'refused', notice: NOTICES.turnedOff }
  return { kind: 'profile', profile: { ...profile, role: profile.role as Role }, offline: false }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  /** undefined until the stored session has been read; null when there is none to use. */
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  /**
   * The stored session couldn't be refreshed because the server was unreachable. It is
   * still in storage and will refresh once the network is back.
   */
  const [stalled, setStalled] = useState(false)
  const [resolved, setResolved] = useState<{ identity: string; result: Resolved } | null>(null)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [remembered, setRemembered] = useState(() => identityCache.read())
  /**
   * Whose session is in storage right now, read once at start. Offline, supabase-js
   * retries a refresh for up to 30 s before getSession settles, so the app opens on
   * the profile this device remembers for that same user instead of waiting. Not for
   * admins: their MFA check must always come first.
   */
  const [startedAs] = useState(() => {
    const id = storedSessionUserId(localStorage, AUTH_STORAGE_KEY)
    const known = identityCache.read()
    return id && known?.id === id && known.role !== 'admin' ? known : null
  })
  /** Bumped when the browser comes back online, to ask the server again. */
  const [attempt, setAttempt] = useState(0)
  /**
   * Bumped by signOut. A session that arrives afterwards from work started before it (a
   * slow offline refresh that finally got through) is ignored, so sign-out sticks.
   */
  const signOuts = useRef(0)
  const signingOut = useRef(false)

  useEffect(() => {
    const load = () => {
      const started = signOuts.current
      return supabase.auth.getSession().then(({ data, error }) => {
        if (signOuts.current !== started) return
        setStalled(data.session === null && error !== null && isUnreachable(error))
        setSession(data.session)
      })
    }
    void load()
    // Keep this callback synchronous: calling Supabase from inside it can deadlock.
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (signingOut.current && next) return
      if (event === 'SIGNED_OUT') {
        // A real sign-out, or Supabase found the session dead: forget this device's profile.
        identityCache.clear()
        setRemembered(null)
        setStalled(false)
      }
      // An empty first event can mean "couldn't refresh offline"; load() tells the two apart.
      if (event === 'INITIAL_SESSION' && next === null) return
      if (next) setStalled(false)
      setSession(next)
    })
    const onOnline = () => {
      setAttempt((n) => n + 1)
      void load()
    }
    window.addEventListener('online', onOnline)
    return () => {
      data.subscription.unsubscribe()
      window.removeEventListener('online', onOnline)
    }
  }, [])

  // Resolve again when the user or their assurance level changes (not on every hourly
  // token refresh), and when the network comes back.
  const identity = session ? `${session.user.id}:${aalOf(session)}` : null

  useEffect(() => {
    if (!session || !identity) return
    let current = true
    const refuse = async (message: string) => {
      identityCache.clear()
      setRemembered(null)
      setNotice(message)
      await supabase.auth.signOut({ scope: 'local' })
    }
    resolve(session)
      .then(async (result) => {
        if (!current) return
        if (result.kind === 'unreachable') {
          const fallback = identityCache.read()
          if (fallback?.id === session.user.id) {
            setResolved({ identity, result: { kind: 'profile', profile: fallback, offline: true } })
          } else {
            await refuse('Couldn’t reach the server. Check your connection and sign in again.')
          }
          return
        }
        if (result.kind === 'refused') {
          await refuse(result.notice)
          return
        }
        if (result.kind === 'profile') {
          identityCache.write(result.profile)
          setRemembered(result.profile)
        }
        setResolved({ identity, result })
      })
      .catch(async () => {
        if (current)
          await refuse('Couldn’t load your account. Check your connection and sign in again.')
      })
    return () => {
      current = false
    }
    // `session` changes on every token refresh; `identity` captures what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, attempt])

  const state: AuthState = useMemo(() => {
    // Not yet confirmed by the server: carry on as the remembered user, if it's them.
    const provisional = (current: Session | null): AuthState | null => {
      const known = remembered && startedAs?.id === remembered.id ? remembered : null
      if (!known || (current && current.user.id !== known.id)) return null
      return { status: 'signed-in', session: current, profile: known, offline: true }
    }
    if (session === undefined) return provisional(null) ?? { status: 'loading' }
    if (session === null) {
      if (stalled && remembered) {
        return { status: 'signed-in', session: null, profile: remembered, offline: true }
      }
      return notice ? { status: 'signed-out', notice } : { status: 'signed-out' }
    }
    if (resolved?.identity !== identity) {
      // The same person passing (or dropping) the code step: keep the screen while the
      // new level is checked, rather than unmounting it to a loading state.
      const before = resolved?.result
      if (before?.kind === 'profile' && before.profile.id === session.user.id) {
        return { status: 'signed-in', session, profile: before.profile, offline: before.offline }
      }
      return provisional(session) ?? { status: 'loading' }
    }
    const result = resolved.result
    if (result.kind === 'needs-code') return { status: 'needs-code', session }
    if (result.kind === 'profile') {
      return { status: 'signed-in', session, profile: result.profile, offline: result.offline }
    }
    return { status: 'loading' }
  }, [session, stalled, remembered, startedAs, identity, resolved, notice])

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
    // Forget everything on this device first, so the screen changes at once even when
    // supabase-js is busy retrying an offline refresh (it holds its lock for up to 30 s).
    signOuts.current += 1
    signingOut.current = true
    setNotice(undefined)
    identityCache.clear()
    setRemembered(null)
    queryClient.clear()
    localStorage.removeItem(AUTH_STORAGE_KEY)
    setStalled(false)
    setResolved(null)
    setSession(null)
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } finally {
      // Offline with an expired token, supabase-js returns early and keeps the session,
      // and a refresh that got through meanwhile may have saved one: remove it again.
      localStorage.removeItem(AUTH_STORAGE_KEY)
      signingOut.current = false
    }
  }, [queryClient])

  const value = useMemo<Auth>(
    () => ({ ...state, signIn, verifyCode, signOut }),
    [state, signIn, verifyCode, signOut],
  )
  return <AuthContext value={value}>{children}</AuthContext>
}
