import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { ACCOUNTS, PASSWORD, signIn } from './accounts'
import { clearEntries, entriesOn, todayNY } from './data'
import { keptOnDevice } from './device'
import { signedInClient } from './supabase'

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
    const math = page.getByRole('region', { name: 'Singapore Math', exact: true })
    await expect(math).toBeVisible()

    // The first visit installs the service worker; it takes over from the next load.
    await page.waitForFunction('navigator.serviceWorker.ready.then(() => true)')
    await page.reload()
    await page.waitForFunction('navigator.serviceWorker.controller !== null')

    await expect(math).toBeVisible()
    await keptOnDevice(page)
    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
    await expect(page.getByText(ACCOUNTS.student.name, { exact: true })).toBeVisible()
    // The trackers come from the copy kept on the device.
    await expect(math.getByText('Pages 32–35', { exact: true })).toBeVisible()
    await expect(page.getByText('Offline. Saves stay on this device.')).toBeVisible()

    // A screen not opened yet is precached too.
    await page.getByRole('link', { name: 'My week' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'My week' })).toBeVisible()
    await context.setOffline(false)
  })

  test('a check-in made offline survives a reload, then syncs exactly once', async ({
    page,
    context,
  }) => {
    const client = await signedInClient(ACCOUNTS.student.email)
    await clearEntries(client, 'violin', todayNY())
    await signIn(page, ACCOUNTS.student.email, PASSWORD)
    const violin = page.getByRole('region', { name: 'Violin', exact: true })
    await expect(violin).toBeVisible() // the data is here, and kept on the device
    await page.waitForFunction('navigator.serviceWorker.ready.then(() => true)')
    await page.reload()
    await page.waitForFunction('navigator.serviceWorker.controller !== null')
    await expect(violin).toBeVisible()
    await keptOnDevice(page)

    await context.setOffline(true)
    await page.reload()
    await violin.getByText('Yes', { exact: true }).click()
    await violin.getByRole('textbox').fill('bow speed, offline')
    await violin.getByRole('textbox').press('Enter')
    await expect(violin.getByText('· On this device, will sync')).toBeVisible()
    await expect(page.getByText('Saved on this device, will sync')).toBeVisible()

    // Closing and reopening without a connection loses nothing.
    await page.reload()
    await expect(violin.getByText('bow speed, offline')).toBeVisible()
    await expect(violin.getByText('· On this device, will sync')).toBeVisible()
    expect(await entriesOn(client, 'violin', todayNY())).toEqual([])

    await context.setOffline(false)
    await expect(violin.getByText('· Synced')).toBeVisible({ timeout: 20_000 })
    await expect
      .poll(async () => (await entriesOn(client, 'violin', todayNY())).map((e) => e.data))
      .toEqual([{ practiced: true, focus: 'bow speed, offline' }])
  })

  test('offers a new version once it is downloaded, and switches to it', async ({ page }) => {
    await signIn(page, ACCOUNTS.student.email, PASSWORD)
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
    await page.waitForFunction('navigator.serviceWorker.ready.then(() => true)')
    await page.reload()
    await page.waitForFunction('navigator.serviceWorker.controller !== null')
    const notice = page
      .getByRole('status')
      .filter({ hasText: 'A new version of the app is ready.' })
    await expect(notice).toHaveCount(0)

    // A deploy: the server's service worker changes while the app is open.
    const sw = resolve(import.meta.dirname, '..', 'dist', 'sw.js')
    const deployed = await readFile(sw, 'utf8')
    try {
      await writeFile(sw, `${deployed}\n// the next version\n`)
      // Coming back to the app is one of the moments it looks for a new version.
      await page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
      await expect(notice).toBeVisible({ timeout: 20_000 })

      const reloaded = page.waitForEvent('load')
      await notice.getByRole('button', { name: 'Update' }).click()
      await reloaded
      await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
      await expect(notice).toHaveCount(0)
      // The new version is the one running: nothing is left waiting.
      expect(
        await page.evaluate(
          'navigator.serviceWorker.getRegistration().then((r) => r !== undefined && r.waiting === null)',
        ),
      ).toBe(true)
    } finally {
      await writeFile(sw, deployed)
    }
  })
})
