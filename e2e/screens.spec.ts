import { expect, test } from '@playwright/test'
import { ACCOUNTS, authFile, ROLES } from './accounts'
import { assignmentId, planItemId } from './data'
import { signedInClient } from './supabase'

/**
 * Screenshots for review, not comparison (CLAUDE.md, "Look at what you build"):
 * every Phase 1 screen at desktop and phone sizes, light and dark, written to
 * test-results/screens/. Fonts render differently per OS, so nothing is diffed.
 */
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
] as const
const THEMES = ['light', 'dark'] as const

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

      test('login', async ({ page }) => {
        await page.goto('login')
        await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
        await page.screenshot({
          path: `test-results/screens/login-${viewport.name}-${theme}.png`,
          fullPage: true,
        })
      })

      test.describe('log flow', () => {
        test.use({ storageState: authFile('student') })

        test('steps', async ({ page }) => {
          const client = await signedInClient(ACCOUNTS.student.email)
          const math = await assignmentId(client, 'singapore-math')
          await page.goto(`log/${math}/${await planItemId(client, 'singapore-math', 6)}`)
          const shot = (name: string) =>
            page.screenshot({
              path: `test-results/screens/log-${name}-${viewport.name}-${theme}.png`,
              fullPage: true,
            })
          await expect(page.getByRole('progressbar', { name: 'Progress' })).toBeVisible()
          await page.keyboard.press('Space')
          await shot('1-checklist')
          await page.keyboard.press('Enter')
          await page.keyboard.type('iiihs')
          await shot('2-tally')
          await page.keyboard.press('Enter')
          await page.keyboard.type('45')
          await page.keyboard.press('Enter')
          await page.keyboard.press('Enter')
          await shot('5-did')
        })
      })

      for (const role of ROLES) {
        test.describe(role, () => {
          test.use({ storageState: authFile(role) })

          test(ACCOUNTS[role].landing, async ({ page }) => {
            await page.goto('')
            await expect(
              page.getByRole('heading', { level: 1, name: ACCOUNTS[role].landing }),
            ).toBeVisible()
            // Wait for data, so the shot shows the screen rather than "Loading…".
            await expect(page.getByRole('status')).toHaveCount(0)
            await page.screenshot({
              path: `test-results/screens/${role}-${viewport.name}-${theme}.png`,
              fullPage: true,
            })
          })
        })
      }
    })
  }
}
