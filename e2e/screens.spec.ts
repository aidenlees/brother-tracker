import { expect, test, type Page } from '@playwright/test'
import { ACCOUNTS, authFile, PASSWORD, ROLES, signIn } from './accounts'
import { addDays, assignmentId, clearEntries, planItemId, todayNY } from './data'
import { signedInClient } from './supabase'

/**
 * Screenshots for review, not comparison (CLAUDE.md, "Look at what you build"): every
 * screen and state at desktop and phone sizes, light and dark, written to
 * test-results/screens/. Fonts render differently per OS, so nothing is diffed.
 */
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
] as const
const THEMES = ['light', 'dark'] as const

/** A small PNG (a notebook page with a few ink lines). */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAAUklEQVR42u3WsQkAIAxE0WxiYeP+o9kErLKGCQ9ugQe/uHh5Wy8AAACGAtY+v01CAAAAAAAAAL6QhAAAAAAAAAB8IQkBAAAAAAAA+EISAgDoDygrYcE92cipGQAAAABJRU5ErkJggg==',
  'base64',
)

const heading = (page: Page) => page.getByRole('heading', { level: 2 })

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`${viewport.name} ${theme}`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: theme,
        // Settles transitions instantly (tokens.css honours reduced motion), so a
        // screenshot never catches the nav underline mid-fade after a redirect.
        reducedMotion: 'reduce',
      })
      test.describe.configure({ mode: 'serial' })

      const shot = (page: Page, name: string) =>
        page.screenshot({
          path: `test-results/screens/${name}-${viewport.name}-${theme}.png`,
          fullPage: true,
        })

      /** After the data is in, so the shot shows the screen rather than "Loading…". */
      const settled = (page: Page) => expect(page.getByRole('status')).toHaveCount(0)

      test('login', async ({ page }) => {
        await page.goto('login')
        await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
        await shot(page, 'login')
      })

      for (const role of ROLES) {
        test.describe(role, () => {
          test.use({ storageState: authFile(role) })

          test(ACCOUNTS[role].landing, async ({ page }) => {
            if (role === 'student') {
              const client = await signedInClient(ACCOUNTS.student.email)
              await clearEntries(client, 'singapore-math', todayNY())
              await clearEntries(client, 'violin', todayNY())
            }
            await page.goto('')
            await expect(
              page.getByRole('heading', { level: 1, name: ACCOUNTS[role].landing }),
            ).toBeVisible()
            await settled(page)
            await shot(page, role)
          })
        })
      }

      test.describe('student', () => {
        test.use({ storageState: authFile('student') })

        test('log flow, step by step', async ({ page }) => {
          const client = await signedInClient(ACCOUNTS.student.email)
          await clearEntries(client, 'singapore-math', todayNY())
          const math = await assignmentId(client, 'singapore-math')
          await page.goto(`log/${math}/${await planItemId(client, 'singapore-math', 6)}`)
          await expect(page.getByRole('progressbar', { name: 'Progress' })).toBeVisible()

          await page.keyboard.press('Space')
          await shot(page, 'log-1-checklist')
          await page.keyboard.press('Enter')
          await page.keyboard.type('iiihs')
          await shot(page, 'log-2-tally')
          await page.keyboard.press('Enter')
          await page.keyboard.type('p. 31 #4')
          await page.keyboard.press('Enter')
          await shot(page, 'log-3-retries')
          await page.keyboard.press('Enter')
          await expect(heading(page)).toContainText('Minutes')
          await page.keyboard.press('Enter')
          await expect(page.getByRole('alert')).toBeVisible()
          await shot(page, 'log-4-required')
          await page.keyboard.type('45')
          await page.keyboard.press('Enter')
          await page.keyboard.press('Enter')
          await shot(page, 'log-6-did')
          await page.keyboard.press('Enter')
          await page.keyboard.type('p. 31 #4')
          await page.keyboard.press('Enter')
          await shot(page, 'log-8-reflection')
          await page.keyboard.press('Enter')
          const chooser = page.waitForEvent('filechooser')
          await page.getByRole('button', { name: 'Add a photo' }).click()
          await (
            await chooser
          ).setFiles({ name: 'notebook.png', mimeType: 'image/png', buffer: PNG })
          await expect(page.getByRole('img', { name: 'Notebook photo, as added' })).toBeVisible()
          await shot(page, 'log-9-photo')

          // Saved: the card shows the check mark and what comes next.
          await page.getByRole('button', { name: 'Save' }).click()
          const card = page.getByRole('region', { name: 'Singapore Math', exact: true })
          await expect(card.getByText('· Synced')).toBeVisible({ timeout: 20_000 })
          await expect(card.getByRole('region', { name: /^Next: / })).toBeVisible()
          await settled(page)
          await shot(page, 'today-math-saved')
          await clearEntries(client, 'singapore-math', todayNY())
        })

        test('Today: saved on this device, then synced', async ({ page, context }) => {
          const client = await signedInClient(ACCOUNTS.student.email)
          await clearEntries(client, 'violin', todayNY())
          await page.goto('today')
          const violin = page.getByRole('region', { name: 'Violin', exact: true })
          await expect(violin).toBeVisible()

          await context.setOffline(true)
          await violin.getByText('Yes', { exact: true }).click()
          await violin.getByRole('textbox').fill('clean shift to 3rd position in bar 12')
          await violin.getByRole('textbox').press('Enter')
          await expect(violin.getByText('· On this device, will sync')).toBeVisible()
          await shot(page, 'today-saved-offline')

          await context.setOffline(false)
          await expect(violin.getByText('· Synced')).toBeVisible({ timeout: 20_000 })
          await shot(page, 'today-saved')
          await clearEntries(client, 'violin', todayNY())
        })

        test('an entry past its 7 days', async ({ page }) => {
          const client = await signedInClient(ACCOUNTS.student.email)
          const violin = await assignmentId(client, 'violin')
          await page.goto(`log/${violin}?date=${addDays(todayNY(), -8)}`)
          await expect(page.getByText(/^Locked:/)).toBeVisible()
          await shot(page, 'locked')
        })
      })

      test.describe('a review day, and a tracker that hasn’t started', () => {
        test.use({ storageState: { cookies: [], origins: [] } })

        test('Today', async ({ page }) => {
          await signIn(page, 'student2@example.test', PASSWORD)
          await expect(page.getByText(/^Every open retry/)).toBeVisible()
          await expect(page.getByText(/^Starts /)).toBeVisible()
          await settled(page)
          await shot(page, 'today-review')
        })
      })
    })
  }
}
