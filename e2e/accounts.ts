import type { Page } from '@playwright/test'

/** The fake local accounts from supabase/seed.sql. Local only; nothing real. */
export const PASSWORD = 'local-dev-password'

export const ACCOUNTS = {
  student: {
    email: 'student@example.test',
    name: 'Sam',
    landing: 'Today',
    path: /\/today$/,
    nav: ['Today', 'My week', 'Settings'],
  },
  admin: {
    email: 'admin@example.test',
    name: 'Alex',
    landing: 'Overview',
    path: /\/overview$/,
    nav: ['Overview', 'Struggles', 'Retry queue', 'Plan', 'Tasks', 'Export', 'Settings'],
  },
  viewer: {
    email: 'viewer@example.test',
    name: 'Jordan',
    landing: 'Overview',
    path: /\/overview$/,
    nav: ['Overview', 'Struggles', 'Settings'],
  },
} as const

export type RoleName = keyof typeof ACCOUNTS
export const ROLES = Object.keys(ACCOUNTS) as RoleName[]

export const authFile = (role: RoleName) => `e2e/.auth/${role}.json`

export async function signIn(page: Page, email: string, password: string) {
  await page.goto('login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}
