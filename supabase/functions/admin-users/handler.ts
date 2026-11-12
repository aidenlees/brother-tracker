/**
 * admin-users (CLAUDE.md, "Adding people"; security rules 4 and 10): the one place the
 * service key creates or disables an account, sets a temporary password or changes a
 * role. Everything else on the People page (names, viewer links, assignments) goes
 * through the client and RLS.
 *
 * Who may call it: a signed-in, active admin, and, once they have turned on two-step
 * sign-in, only from a session that passed the code (aal2), the same rule the database
 * applies to admin writes (private.admin_mfa_ok). It trusts nothing else in the request.
 *
 * This file is the rules alone, with its effects passed in (`Deps`), so Vitest checks
 * every refusal without a server; index.ts wires it to Supabase.
 */

export const ROLES = ['student', 'admin', 'viewer'] as const
export type Role = (typeof ROLES)[number]

export type Account = {
  id: string
  email: string | null
  lastSignInAt: string | null
  disabled: boolean
}

export type Deps = {
  /** The user a bearer token belongs to (checked with Auth), or null. */
  caller(token: string): Promise<{ id: string; aal: string } | null>
  profile(id: string): Promise<{ role: string; active: boolean } | null>
  hasVerifiedFactor(id: string): Promise<boolean>
  accounts(): Promise<Account[]>
  /** Creates the sign-in and its profile, or says why it couldn't. */
  create(input: {
    email: string
    password: string
    displayName: string
    role: Role
  }): Promise<{ id: string } | { error: string; status: number }>
  setPassword(id: string, password: string): Promise<string | null>
  setActive(id: string, active: boolean): Promise<string | null>
  /** How many assignments and viewer links tie this person to their role. */
  ties(id: string): Promise<number>
  setRole(id: string, role: Role): Promise<string | null>
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

const refuse = (status: number, error: string) => json(status, { error })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** A temporary password: 10 to 72 characters (bcrypt reads no further). */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string') return 'Give a temporary password.'
  if (password.length < 10) return 'A temporary password needs at least 10 characters.'
  if (password.length > 72) return 'A temporary password can be at most 72 characters.'
  return null
}

const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value)

type Body = Record<string, unknown>

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const token = /^Bearer (.+)$/.exec(req.headers.get('Authorization') ?? '')?.[1]
  if (!token) return refuse(401, 'Sign in first.')
  if (req.method !== 'POST') return refuse(405, 'Use POST.')
  const caller = await deps.caller(token)
  if (!caller) return refuse(401, 'Sign in again.')
  const profile = await deps.profile(caller.id)
  if (!profile || profile.role !== 'admin' || !profile.active) {
    return refuse(403, 'Only the admin manages accounts.')
  }
  if (caller.aal !== 'aal2' && (await deps.hasVerifiedFactor(caller.id))) {
    return refuse(403, 'Enter your two-step code first: sign out and in again.')
  }

  let body: Body
  try {
    const parsed: unknown = await req.json()
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error()
    body = parsed as Body
  } catch {
    return refuse(400, 'The request wasn’t readable.')
  }

  switch (body.action) {
    case 'list':
      return json(200, { accounts: await deps.accounts() })

    case 'create': {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''
      if (!EMAIL.test(email) || email.length > 254) return refuse(400, 'Give a valid email.')
      if (displayName.length < 1 || displayName.length > 40) {
        return refuse(400, 'Give a first name of up to 40 characters.')
      }
      if (!isRole(body.role)) return refuse(400, 'Choose student, viewer or admin.')
      const problem = passwordProblem(body.password)
      if (problem) return refuse(400, problem)
      const made = await deps.create({
        email,
        password: body.password as string,
        displayName,
        role: body.role,
      })
      return 'error' in made ? refuse(made.status, made.error) : json(200, { id: made.id })
    }

    case 'password': {
      if (typeof body.userId !== 'string' || !UUID.test(body.userId)) {
        return refuse(400, 'Choose a person.')
      }
      const problem = passwordProblem(body.password)
      if (problem) return refuse(400, problem)
      const failed = await deps.setPassword(body.userId, body.password as string)
      return failed ? refuse(500, failed) : json(200, { ok: true })
    }

    case 'active': {
      if (typeof body.userId !== 'string' || !UUID.test(body.userId)) {
        return refuse(400, 'Choose a person.')
      }
      if (typeof body.active !== 'boolean') return refuse(400, 'Say whether to enable or disable.')
      if (body.userId === caller.id) return refuse(409, 'You can’t disable your own account.')
      const failed = await deps.setActive(body.userId, body.active)
      return failed ? refuse(500, failed) : json(200, { ok: true })
    }

    case 'role': {
      if (typeof body.userId !== 'string' || !UUID.test(body.userId)) {
        return refuse(400, 'Choose a person.')
      }
      if (!isRole(body.role)) return refuse(400, 'Choose student, viewer or admin.')
      if (body.userId === caller.id) return refuse(409, 'You can’t change your own role.')
      if ((await deps.ties(body.userId)) > 0) {
        return refuse(
          409,
          'Remove their trackers and viewer links first: those belong to their current role.',
        )
      }
      const failed = await deps.setRole(body.userId, body.role)
      return failed ? refuse(500, failed) : json(200, { ok: true })
    }

    default:
      return refuse(400, 'Unknown action.')
  }
}

/** The assurance level in a token Auth has already accepted (its payload, unverified here). */
export function aalOf(token: string): string {
  try {
    const payload = token.split('.')[1] ?? ''
    const text = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const claims = JSON.parse(text) as { aal?: unknown }
    return typeof claims.aal === 'string' ? claims.aal : 'aal1'
  } catch {
    return 'aal1'
  }
}
