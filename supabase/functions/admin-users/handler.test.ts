// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { aalOf, handle, passwordProblem, type Deps } from './handler.ts'

const ADMIN = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'

/** A token whose payload carries an assurance level (the signature is Auth's concern). */
const token = (aal: string) =>
  `x.${Buffer.from(JSON.stringify({ aal })).toString('base64url')}.y`

function deps(over: Partial<Deps> = {}): Deps {
  return {
    caller: vi.fn(async (t: string) => (t ? { id: ADMIN, aal: aalOf(t) } : null)),
    profile: vi.fn(async () => ({ role: 'admin', active: true })),
    hasVerifiedFactor: vi.fn(async () => false),
    accounts: vi.fn(async () => []),
    create: vi.fn(async () => ({ id: OTHER })),
    setPassword: vi.fn(async () => null),
    setActive: vi.fn(async () => null),
    ties: vi.fn(async () => 0),
    setRole: vi.fn(async () => null),
    ...over,
  }
}

const call = (body: unknown, d: Deps, auth: string | null = `Bearer ${token('aal1')}`) =>
  handle(
    new Request('http://local/admin-users', {
      method: 'POST',
      headers: auth ? { Authorization: auth } : {},
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    d,
  )

const read = async (res: Response) => ({ status: res.status, body: (await res.json()) as unknown })

describe('admin-users: who may call it', () => {
  it('refuses a request with no session', async () => {
    const d = deps()
    expect(await read(await call({ action: 'list' }, d, null))).toEqual({
      status: 401,
      body: { error: 'Sign in first.' },
    })
    expect(d.accounts).not.toHaveBeenCalled()
  })

  it('refuses a session Auth doesn’t accept', async () => {
    const d = deps({ caller: vi.fn(async () => null) })
    expect((await call({ action: 'list' }, d)).status).toBe(401)
  })

  it.each([
    ['a student', { role: 'student', active: true }],
    ['a viewer', { role: 'viewer', active: true }],
    ['a disabled admin', { role: 'admin', active: false }],
    ['an account with no profile', null],
  ])('refuses %s', async (_who, profile) => {
    const d = deps({ profile: vi.fn(async () => profile) })
    const res = await read(await call({ action: 'create' }, d))
    expect(res).toEqual({ status: 403, body: { error: 'Only the admin manages accounts.' } })
    expect(d.create).not.toHaveBeenCalled()
  })

  it('refuses an admin with two-step on until the session passed the code', async () => {
    const d = deps({ hasVerifiedFactor: vi.fn(async () => true) })
    expect((await call({ action: 'list' }, d)).status).toBe(403)
    expect((await call({ action: 'list' }, d, `Bearer ${token('aal2')}`)).status).toBe(200)
  })

  it('answers the browser’s preflight, and only POST', async () => {
    const d = deps()
    const pre = await handle(new Request('http://local/x', { method: 'OPTIONS' }), d)
    expect(pre.headers.get('Access-Control-Allow-Headers')).toContain('authorization')
    expect((await handle(new Request('http://local/x'), d)).status).toBe(401)
    const get = new Request('http://local/x', { headers: { Authorization: `Bearer ${token('aal1')}` } })
    expect((await handle(get, d)).status).toBe(405)
  })
})

describe('admin-users: what it does', () => {
  it('creates an account, a first name and a role', async () => {
    const d = deps()
    const res = await read(
      await call(
        {
          action: 'create',
          email: ' New@Example.test ',
          password: 'long-enough-1',
          displayName: ' Robin ',
          role: 'viewer',
        },
        d,
      ),
    )
    expect(res).toEqual({ status: 200, body: { id: OTHER } })
    expect(d.create).toHaveBeenCalledWith({
      email: 'new@example.test',
      password: 'long-enough-1',
      displayName: 'Robin',
      role: 'viewer',
    })
  })

  it.each([
    [{ email: 'nope', password: 'long-enough-1', displayName: 'A', role: 'student' }, 'Give a valid email.'],
    [{ email: 'a@b.test', password: 'short', displayName: 'A', role: 'student' }, 'A temporary password needs at least 10 characters.'],
    [{ email: 'a@b.test', password: 'long-enough-1', displayName: '', role: 'student' }, 'Give a first name of up to 40 characters.'],
    [{ email: 'a@b.test', password: 'long-enough-1', displayName: 'A', role: 'owner' }, 'Choose student, viewer or admin.'],
  ])('checks what it’s given: %o', async (fields, error) => {
    const d = deps()
    expect(await read(await call({ action: 'create', ...fields }, d))).toEqual({
      status: 400,
      body: { error },
    })
    expect(d.create).not.toHaveBeenCalled()
  })

  it('says when the email is taken', async () => {
    const d = deps({
      create: vi.fn(async () => ({ error: 'An account with that email already exists.', status: 409 })),
    })
    const res = await call(
      { action: 'create', email: 'a@b.test', password: 'long-enough-1', displayName: 'A', role: 'student' },
      d,
    )
    expect(res.status).toBe(409)
  })

  it('sets a temporary password', async () => {
    const d = deps()
    expect((await call({ action: 'password', userId: OTHER, password: 'another-one-2' }, d)).status).toBe(200)
    expect(d.setPassword).toHaveBeenCalledWith(OTHER, 'another-one-2')
    expect((await call({ action: 'password', userId: 'x', password: 'another-one-2' }, d)).status).toBe(400)
  })

  it('disables and enables anyone but the caller', async () => {
    const d = deps()
    expect((await call({ action: 'active', userId: OTHER, active: false }, d)).status).toBe(200)
    expect(d.setActive).toHaveBeenCalledWith(OTHER, false)
    const self = await read(await call({ action: 'active', userId: ADMIN, active: false }, d))
    expect(self).toEqual({ status: 409, body: { error: 'You can’t disable your own account.' } })
  })

  it('changes a role only when nothing ties the person to the old one, never your own', async () => {
    const d = deps()
    expect((await call({ action: 'role', userId: OTHER, role: 'viewer' }, d)).status).toBe(200)
    expect((await call({ action: 'role', userId: ADMIN, role: 'viewer' }, d)).status).toBe(409)
    const tied = deps({ ties: vi.fn(async () => 2) })
    expect((await call({ action: 'role', userId: OTHER, role: 'viewer' }, tied)).status).toBe(409)
    expect(tied.setRole).not.toHaveBeenCalled()
  })

  it('refuses what it can’t read or doesn’t know', async () => {
    const d = deps()
    expect((await call('not json', d)).status).toBe(400)
    expect((await call([1, 2], d)).status).toBe(400)
    expect((await call({ action: 'delete' }, d)).status).toBe(400)
  })
})

describe('admin-users: small rules', () => {
  it('reads the assurance level from a token, defaulting to the lower one', () => {
    expect(aalOf(token('aal2'))).toBe('aal2')
    expect(aalOf('garbage')).toBe('aal1')
  })

  it('wants a temporary password of 10 to 72 characters', () => {
    expect(passwordProblem('x'.repeat(10))).toBeNull()
    expect(passwordProblem('x'.repeat(73))).toBe('A temporary password can be at most 72 characters.')
    expect(passwordProblem(undefined)).toBe('Give a temporary password.')
  })
})
