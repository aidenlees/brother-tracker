import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

const { describeTwoStep, groupKey, qrSource } = await import('./two-step')

const authError = (
  over: Partial<Record<'code' | 'name' | 'message', string>> & { status?: number },
) => ({
  code: undefined,
  status: 400,
  name: 'AuthApiError',
  message: 'x',
  ...over,
})

describe('two-step sign-in', () => {
  it('shows the QR code as an image, whether or not it came as a data URL', () => {
    expect(qrSource('data:image/svg+xml;utf-8,<svg/>')).toBe('data:image/svg+xml;utf-8,<svg/>')
    expect(qrSource('<svg width="10"/>')).toBe(
      'data:image/svg+xml;utf-8,%3Csvg%20width%3D%2210%22%2F%3E',
    )
  })

  it('groups the key in fours, for typing by hand', () => {
    expect(groupKey('JBSWY3DPEHPK3PXPJBSW')).toBe('JBSW Y3DP EHPK 3PXP JBSW')
    expect(groupKey('ABCDE')).toBe('ABCD E')
  })

  it('says why a step failed', () => {
    expect(describeTwoStep(authError({ code: 'mfa_verification_failed' }))).toBe(
      'That code didn’t work. Check the app and try again.',
    )
    expect(describeTwoStep(authError({ status: 429 }))).toBe(
      'Too many tries. Wait a minute, then try again.',
    )
    expect(describeTwoStep(authError({ name: 'AuthRetryableFetchError', status: 0 }))).toBe(
      'Couldn’t reach the server. Check your connection, then try again.',
    )
    expect(describeTwoStep(authError({ code: 'unexpected_failure', status: 500 }))).toBe(
      'That didn’t go through. Reload and try again.',
    )
  })
})
