import { expect, test } from '@playwright/test'
import { ACCOUNTS, authFile, ROLES } from './accounts'

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

      for (const role of ROLES) {
        test.describe(role, () => {
          test.use({ storageState: authFile(role) })

          test(ACCOUNTS[role].landing, async ({ page }) => {
            await page.goto('')
            await expect(
              page.getByRole('heading', { level: 1, name: ACCOUNTS[role].landing }),
            ).toBeVisible()
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
