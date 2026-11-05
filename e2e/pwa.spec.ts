import { expect, test } from '@playwright/test'
import { ACCOUNTS, PASSWORD, signIn } from './accounts'

/**
 * The installable app (a production build: only it has the service worker). Runs in the
 * `pwa` project on its own origin, so it signs in itself rather than reusing a session.
 */
test.describe('the installed app', () => {
  test('is installable: a manifest with a name and icons', async ({ page, request }) => {
    await page.goto('login')
    const href = await page.locator('link[rel="manifest"]').getAttribute('href')
    expect(href).toBeTruthy()
    const manifest = (await (await request.get(new URL(href ?? '', page.url()).href)).json()) as {
      name: string
      display: string
      start_url: string
      icons: { sizes: string; purpose?: string }[]
    }
    expect(manifest.name).toBe('Practice tracker')
    expect(manifest.display).toBe('standalone')
    expect(manifest.icons.map((i) => i.sizes)).toEqual(
      expect.arrayContaining(['192x192', '512x512']),
    )
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true)
  })

  test('opens with no network at all, still signed in', async ({ page, context }) => {
    await signIn(page, ACCOUNTS.student.email, PASSWORD)
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()

    // The first visit installs the service worker; it takes over from the next load.
    await page.waitForFunction('navigator.serviceWorker.ready.then(() => true)')
    await page.reload()
    await page.waitForFunction('navigator.serviceWorker.controller !== null')

    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
    await expect(page.getByText(ACCOUNTS.student.name, { exact: true })).toBeVisible()
    await expect(page.getByText('Offline. Saves stay on this device.')).toBeVisible()

    // A screen not opened yet is precached too.
    await page.getByRole('link', { name: 'My week' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'My week' })).toBeVisible()
    await context.setOffline(false)
  })
})
