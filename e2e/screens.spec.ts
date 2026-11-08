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

      /** After the data (and any page images) are in, so the shot shows the screen. */
      const settled = async (page: Page) => {
        await expect(page.getByRole('status')).toHaveCount(0)
        // Page images: their signed links are in (no loading placeholders) and drawn.
        await page.waitForFunction(
          "!document.querySelector('.animate-pulse') && [...document.images].every((i) => i.complete && i.naturalWidth > 0)",
        )
      }

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

      test.describe('admin', () => {
        test.use({ storageState: authFile('admin') })

        test('the plan editor, and editing a session', async ({ page }) => {
          await page.goto('plan')
          await page
            .getByLabel('Student and tracker')
            .selectOption({ label: 'Sam · Singapore Math' })
          await expect(page.getByText(/Session 5 · Solve by Assuming/).first()).toBeVisible()
          await settled(page)
          await shot(page, 'plan')
          await page.getByRole('button', { name: /^Edit .*Session 8 · Working Backward$/ }).click()
          await expect(page.getByRole('form', { name: /^Edit / })).toBeVisible()
          await shot(page, 'plan-edit')
        })
      })

      test.describe('student', () => {
        test.use({ storageState: authFile('student') })

        test('log flow, step by step', async ({ page }) => {
          const client = await signedInClient(ACCOUNTS.student.email)
          await clearEntries(client, 'singapore-math', todayNY())
          const math = await assignmentId(client, 'singapore-math')
          await page.goto(`log/${math}/${await planItemId(client, 'singapore-math', 5)}`)
          await expect(page.getByRole('progressbar', { name: 'Progress' })).toBeVisible()

          await page.keyboard.press('Enter')
          await expect(page.getByRole('alert')).toBeVisible()
          await shot(page, 'log-1-required')
          await page.keyboard.press('y')
          await shot(page, 'log-1-completed')
          await page.keyboard.press('Enter')
          await page.keyboard.press('Tab')
          await page.keyboard.press('Space')
          await expect(page.getByText('1 checked.')).toBeVisible()
          await shot(page, 'log-2-struggled')
          await page.keyboard.press('Enter')
          await expect(heading(page)).toContainText('Minutes')
          await page.keyboard.type('45')
          await shot(page, 'log-3-minutes')

          // Saved: the card shows the check mark and what comes next.
          await page.getByRole('button', { name: 'Save' }).click()
          const card = page.getByRole('region', { name: 'Singapore Math', exact: true })
          await expect(card.getByText('· Synced')).toBeVisible({ timeout: 20_000 })
          await expect(card.getByText(/^Next: /)).toBeVisible()
          await settled(page)
          await shot(page, 'today-math-saved')
          await clearEntries(client, 'singapore-math', todayNY())
        })

        test('My week, and a session with its pages', async ({ page }) => {
          await page.goto('week')
          await expect(page.getByRole('heading', { level: 1, name: 'My week' })).toBeVisible()
          await settled(page)
          await shot(page, 'week')
          await page.getByRole('link', { name: /^Pages 32–35/ }).click()
          await expect(page.getByRole('img', { name: 'Page 32 of the book' })).toBeVisible()
          await settled(page)
          await shot(page, 'session')
          // A page opens full size, a step from the next one.
          await page.getByRole('button', { name: 'Open page 33' }).click()
          await expect(page.getByRole('dialog', { name: /^Page 33/ })).toBeVisible()
          await settled(page)
          await shot(page, 'session-viewer')
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
