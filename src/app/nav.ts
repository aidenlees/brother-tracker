import type { Role } from '@/lib/supabase'

export type Screen = {
  path: string
  label: string
  roles: readonly Role[]
  /** Shown in the main navigation. Log session is reached from Today, not the nav. */
  inNav: boolean
  /** Route parameters after the path, e.g. ':assignmentId/:planItemId?'. */
  params?: string
  /** Built yet. An unbuilt screen keeps its address ("not built yet") but stays out of the nav. */
  built: boolean
}

/**
 * Every screen and who may use it (CLAUDE.md, "Screens"). Navigation shows only the
 * screens a role can use; the router refuses the rest. RLS still decides the data.
 */
export const SCREENS: readonly Screen[] = [
  { path: 'today', label: 'Today', roles: ['student'], inNav: true, built: true },
  {
    path: 'log',
    label: 'Log session',
    roles: ['student'],
    inNav: false,
    built: true,
    params: ':assignmentId/:planItemId?',
  },
  {
    path: 'session',
    label: 'Session',
    roles: ['student'],
    inNav: false,
    built: true,
    params: ':assignmentId/:planItemId',
  },
  { path: 'week', label: 'My week', roles: ['student'], inNav: true, built: true },
  { path: 'overview', label: 'Overview', roles: ['admin', 'viewer'], inNav: true, built: true },
  { path: 'struggles', label: 'Struggles', roles: ['admin', 'viewer'], inNav: true, built: true },
  { path: 'retries', label: 'Retry queue', roles: ['admin'], inNav: true, built: true },
  { path: 'plan', label: 'Plan', roles: ['admin'], inNav: true, built: true },
  { path: 'tasks', label: 'Tasks', roles: ['admin'], inNav: true, built: true },
  { path: 'builder', label: 'Trackers', roles: ['admin'], inNav: true, built: true },
  { path: 'people', label: 'People', roles: ['admin'], inNav: true, built: true },
  { path: 'export', label: 'Export', roles: ['admin'], inNav: true, built: true },
  {
    path: 'settings',
    label: 'Settings',
    roles: ['student', 'admin', 'viewer'],
    inNav: true,
    built: true,
  },
]

export function navFor(role: Role): Screen[] {
  return SCREENS.filter((s) => s.inNav && s.built && s.roles.includes(role))
}

export function canUse(role: Role, path: string): boolean {
  return SCREENS.some((s) => s.path === path && s.roles.includes(role))
}

/** Where each role lands after signing in. */
export function homeFor(role: Role): string {
  return role === 'student' ? '/today' : '/overview'
}
