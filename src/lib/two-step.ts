/**
 * Two-step sign-in (CLAUDE.md, "Login": the admin role supports TOTP MFA). Turning it on
 * enrolls an authenticator app and confirms it with a code; from then on each sign-in
 * asks for a code (LoginPage) and the database refuses admin writes from a session that
 * hasn't passed one (private.admin_mfa_ok, tested in 11_mfa). Turning it off asks for a
 * code first. All of it needs a connection.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AuthError } from '@supabase/supabase-js'
import { useOutbox } from './outbox/outbox-context'
import { supabase } from './supabase'

export type Setup = { factorId: string; qr: string; key: string }

/** The QR code as an image address: Supabase sends an SVG, sometimes already as a data URL. */
export function qrSource(qr: string): string {
  return qr.startsWith('data:') ? qr : `data:image/svg+xml;utf-8,${encodeURIComponent(qr)}`
}

/** The key in groups of four, easier to type into an app by hand. */
export function groupKey(key: string): string {
  return key.replace(/\s+/g, '').replace(/(.{4})(?=.)/g, '$1 ')
}

/** What went wrong, in words, for any step. */
export function describeTwoStep(error: Pick<AuthError, 'code' | 'status' | 'name' | 'message'>) {
  if (error.code === 'mfa_verification_failed' || error.code === 'mfa_challenge_expired') {
    return 'That code didn’t work. Check the app and try again.'
  }
  if (error.status === 429) return 'Too many tries. Wait a minute, then try again.'
  if (error.name === 'AuthRetryableFetchError') {
    return 'Couldn’t reach the server. Check your connection, then try again.'
  }
  return 'That didn’t go through. Reload and try again.'
}

function fail(error: AuthError): never {
  throw new Error(describeTwoStep(error))
}

/** Is two-step on for this account? (A verified authenticator app.) */
export function useTwoStep() {
  const { userId } = useOutbox()
  return useQuery({
    queryKey: [userId, 'two-step'],
    staleTime: 0,
    networkMode: 'always',
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) fail(error)
      const verified = data.totp[0]
      return { on: verified !== undefined, factorId: verified?.id ?? null }
    },
  })
}

export function useTwoStepWrites() {
  const { userId } = useOutbox()
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: [userId, 'two-step'] })

  /** Clears setups that were started and never confirmed, so only one app is ever set up. */
  const clearUnconfirmed = async () => {
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) fail(error)
    for (const factor of data.all.filter((f) => f.status === 'unverified')) {
      const removed = await supabase.auth.mfa.unenroll({ factorId: factor.id })
      if (removed.error) fail(removed.error)
    }
  }

  const start = useMutation({
    networkMode: 'always',
    mutationFn: async (): Promise<Setup> => {
      await clearUnconfirmed()
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (error) fail(error)
      return { factorId: data.id, qr: data.totp.qr_code, key: data.totp.secret }
    },
  })

  const confirm = useMutation({
    networkMode: 'always',
    mutationFn: async ({ factorId, code }: { factorId: string; code: string }) => {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
      if (error) fail(error)
    },
    onSuccess: refresh,
  })

  const cancel = useMutation({
    networkMode: 'always',
    mutationFn: clearUnconfirmed,
  })

  const turnOff = useMutation({
    networkMode: 'always',
    mutationFn: async ({ factorId, code }: { factorId: string; code: string }) => {
      const verified = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
      if (verified.error) fail(verified.error)
      const { error } = await supabase.auth.mfa.unenroll({ factorId })
      if (error) fail(error)
      // A fresh token, so the session stops carrying the removed factor.
      await supabase.auth.refreshSession()
    },
    onSuccess: refresh,
  })

  return { start, confirm, cancel, turnOff }
}
