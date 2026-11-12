/**
 * admin-users: handler.ts's rules, wired to Supabase with the project's secret key
 * (SUPABASE_SECRET_KEYS.default, or the legacy service key while that still exists).
 * The key never leaves this function. verify_jwt is off (config.toml): new-style keys
 * aren't JWTs, so the caller's session is checked here, with Auth, on every request.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { aalOf, handle, type Deps } from './handler.ts'

function secretKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (keys) {
    const parsed = JSON.parse(keys) as Record<string, string>
    if (parsed.default) return parsed.default
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!legacy) throw new Error('admin-users: no secret key in the environment')
  return legacy
}

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', secretKey(), {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** "Disabled" is a ban that outlasts everyone: 100 years. */
const FOREVER = '876000h'

const deps: Deps = {
  async caller(token) {
    const { data, error } = await admin.auth.getUser(token)
    if (error || !data.user) return null
    return { id: data.user.id, aal: aalOf(token) }
  },
  async profile(id) {
    const { data } = await admin.from('profiles').select('role, active').eq('id', id).maybeSingle()
    return data
  },
  async hasVerifiedFactor(id) {
    const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: id })
    // Unsure means yes: the stricter answer.
    if (error) return true
    return data.factors.some((f) => f.status === 'verified')
  },
  async accounts() {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (error) throw error
    const now = Date.now()
    return data.users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      lastSignInAt: u.last_sign_in_at ?? null,
      disabled: u.banned_until ? Date.parse(u.banned_until) > now : false,
    }))
  },
  async create({ email, password, displayName, role }) {
    const made = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (made.error || !made.data.user) {
      const taken = made.error?.code === 'email_exists' || made.error?.status === 422
      return taken
        ? { error: 'An account with that email already exists.', status: 409 }
        : { error: 'Couldn’t create the account. Try again.', status: 500 }
    }
    const id = made.data.user.id
    const { error } = await admin.from('profiles').insert({ id, role, display_name: displayName })
    if (error) {
      // No half-made accounts: a sign-in without a profile can't use the app anyway.
      await admin.auth.admin.deleteUser(id)
      return { error: 'Couldn’t set up the account. Try again.', status: 500 }
    }
    return { id }
  },
  async setPassword(id, password) {
    const { error } = await admin.auth.admin.updateUserById(id, { password })
    return error ? 'Couldn’t set the password. Try again.' : null
  },
  async setActive(id, active) {
    const banned = await admin.auth.admin.updateUserById(id, {
      ban_duration: active ? 'none' : FOREVER,
    })
    if (banned.error) return 'Couldn’t change the account. Try again.'
    const { error } = await admin.from('profiles').update({ active }).eq('id', id)
    return error ? 'Couldn’t change the account. Try again.' : null
  },
  async ties(id) {
    const [assignments, links] = await Promise.all([
      admin.from('assignments').select('id', { count: 'exact', head: true }).eq('student_id', id),
      admin
        .from('viewer_links')
        .select('viewer_id', { count: 'exact', head: true })
        .or(`viewer_id.eq.${id},student_id.eq.${id}`),
    ])
    return (assignments.count ?? 1) + (links.count ?? 1)
  },
  async setRole(id, role) {
    const { error } = await admin.from('profiles').update({ role }).eq('id', id)
    return error ? 'Couldn’t change the role. Try again.' : null
  },
}

Deno.serve((req) => handle(req, deps))
