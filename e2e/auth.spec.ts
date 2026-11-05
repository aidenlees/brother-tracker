import { expect, test, type Page } from '@playwright/test'
import { ACCOUNTS, PASSWORD, signIn } from './accounts'
import { authStorageKey, localEnv } from './supabase'

/**
 * Staying signed in without a connection. Each test signs in afresh: these tests make
 * the session refresh, and a shared session would rotate under the other specs.
 */
test.describe('@auth offline sign-in', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  const supabaseRoutes = () => `${localEnv().url}/**`

  async function signInAsStudent(page: Page) {
    await signIn(page, ACCOUNTS.student.email, PASSWORD)
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
  }

  /** Makes the stored access token look expired, so the next load must refresh it. */
  async function expireToken(page: Page) {
    await page.evaluate((key) => {
      const raw = localStorage.getItem(key)
      if (!raw) throw new Error(`no session under ${key}`)
      const session = JSON.parse(raw) as { expires_at: number }
      session.expires_at = Math.floor(Date.now() / 1000) - 60
      localStorage.setItem(key, JSON.stringify(session))
    }, authStorageKey())
  }

  async function storedExpiry(page: Page): Promise<number | null> {
    return page.evaluate((key) => {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as { expires_at: number }).expires_at : null
    }, authStorageKey())
  }

  test('a reload with Supabase unreachable and an expired token stays signed in', async ({
    page,
  }) => {
    await signInAsStudent(page)
    await expireToken(page)
    await page.route(supabaseRoutes(), (route) => route.abort('internetdisconnected'))

    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
    await expect(page.getByText(ACCOUNTS.student.name, { exact: true })).toBeVisible()
    await expect(page).toHaveURL(/\/today$/)

    // Back online: the session refreshes by itself and the app carries on.
    await page.unroute(supabaseRoutes())
    await page.evaluate("window.dispatchEvent(new Event('online'))")
    await expect
      .poll(async () => (await storedExpiry(page)) ?? 0, { timeout: 15_000 })
      .toBeGreaterThan(Date.now() / 1000)
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
  })

  test('signing out while unreachable still forgets the session', async ({ page }) => {
    await signInAsStudent(page)
    await expireToken(page)
    await page.route(supabaseRoutes(), (route) => route.abort('internetdisconnected'))
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    expect(await storedExpiry(page)).toBeNull()

    // Online again, the next visit asks for the password.
    await page.unroute(supabaseRoutes())
    await page.goto('today')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })
})
