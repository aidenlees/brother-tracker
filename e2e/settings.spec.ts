import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { ACCOUNTS, authFile, PASSWORD, signIn } from './accounts'
import { localSql } from './supabase'
import { totp } from './totp'

/**
 * Settings: the theme, saved on this device, and the admin's two-step sign-in. The
 * two-step test signs the admin in afresh (never the saved session other specs share)
 * and afterwards removes any authenticator it left, so later specs sign in as before.
 */
const forgetAdminFactors = () => {
  localSql(
    `delete from auth.mfa_factors where user_id = (select id from auth.users where email = '${ACCOUNTS.admin.email}')`,
  )
}

async function scan(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(results.violations).toEqual([])
}

test.describe('@settings settings', () => {
  test.describe('the theme', () => {
    test.use({ storageState: authFile('student') })

    test('is saved on this device and applied before the page draws', async ({ page }) => {
      await page.goto('settings')
      const theme = page.getByRole('radiogroup', { name: 'Theme' })
      await expect(theme.getByRole('radio', { name: 'System' })).toBeChecked()
      await theme.getByText('Dark', { exact: true }).click()
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      await scan(page)

      await page.reload()
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      await expect(theme.getByRole('radio', { name: 'Dark' })).toBeChecked()
      // The browser frame colour follows the choice, not the system setting.
      await expect(page.locator('meta[name="theme-color"][data-scheme="dark"]')).toHaveAttribute(
        'media',
        'all',
      )

      await theme.getByText('System', { exact: true }).click()
      await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/)
      expect(await page.evaluate(() => localStorage.getItem('theme'))).toBeNull()
    })

    test('is all a student sees: two-step sign-in is the admin’s', async ({ page }) => {
      await page.goto('settings')
      await expect(page.getByRole('radiogroup', { name: 'Theme' })).toBeVisible()
      await expect(page.getByRole('region', { name: 'Two-step sign-in' })).toHaveCount(0)
    })
  })

  test.describe('a viewer', () => {
    test.use({ storageState: authFile('viewer') })

    test('sees the theme and no two-step sign-in', async ({ page }) => {
      await page.goto('settings')
      await expect(page.getByRole('radiogroup', { name: 'Theme' })).toBeVisible()
      await expect(page.getByRole('region', { name: 'Two-step sign-in' })).toHaveCount(0)
    })
  })

  test.describe('two-step sign-in', () => {
    test.beforeAll(forgetAdminFactors)
    test.afterAll(forgetAdminFactors)

    test('the admin turns it on, signs in with a code, then turns it off', async ({ page }) => {
      await signIn(page, ACCOUNTS.admin.email, PASSWORD)
      await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
      await page.goto('settings')
      const card = page.getByRole('region', { name: 'Two-step sign-in' })
      await expect(card).toContainText('Off.')

      // Turn it on: the QR code and the key, then a code from the "app".
      await card.getByRole('button', { name: 'Turn on two-step sign-in' }).click()
      await expect(
        card.getByRole('img', { name: 'QR code for your authenticator app' }),
      ).toBeVisible()
      const key = (await card.getByText(/^[A-Z2-7]{4}( [A-Z2-7]{1,4})+$/).textContent()) ?? ''
      expect(key.replace(/ /g, '').length).toBeGreaterThanOrEqual(16)
      await scan(page)
      const box = card.getByRole('textbox', { name: 'Enter the 6-digit code the app shows' })
      await box.fill('123')
      await card.getByRole('button', { name: 'Turn on' }).click()
      await expect(card).toContainText('Enter all 6 digits of the code.')
      await box.fill(totp(key))
      await card.getByRole('button', { name: 'Turn on' }).click()
      await expect(card).toContainText('On. Each new sign-in asks for a 6-digit code')
      await expect(
        page.getByRole('status').filter({ hasText: 'Two-step sign-in is on.' }),
      ).toBeAttached()

      // A new sign-in asks for the code.
      await page.getByRole('button', { name: 'Sign out' }).click()
      await signIn(page, ACCOUNTS.admin.email, PASSWORD)
      await page.getByRole('textbox', { name: 'Code' }).fill(totp(key))
      await page.getByRole('button', { name: 'Verify' }).click()
      // Signed in, back where they were.
      await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()

      // Turn it off: a wrong code is refused, a right one turns it off.
      await page.goto('settings')
      await card.getByRole('button', { name: 'Turn off' }).click()
      const code = card.getByRole('textbox', { name: 'Code' })
      await expect(code).toBeFocused()
      await code.fill(totp(key, Date.now() - 10 * 60_000))
      await card.getByRole('button', { name: 'Turn off' }).click()
      await expect(card.getByRole('alert')).toHaveText(
        'That code didn’t work. Check the app and try again.',
      )
      await code.fill(totp(key))
      await card.getByRole('button', { name: 'Turn off' }).click()
      await expect(card).toContainText('Off.')

      // Signing in again asks only for the password.
      await page.getByRole('button', { name: 'Sign out' }).click()
      await signIn(page, ACCOUNTS.admin.email, PASSWORD)
      await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
      await expect(page.getByRole('textbox', { name: 'Code' })).toHaveCount(0)
    })

    test('half-finished setups are cleared, leaving only the confirmed one', async ({ page }) => {
      await signIn(page, ACCOUNTS.admin.email, PASSWORD)
      await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
      await page.goto('settings')
      const card = page.getByRole('region', { name: 'Two-step sign-in' })
      await card.getByRole('button', { name: 'Turn on two-step sign-in' }).click()
      await expect(card.getByRole('img')).toBeVisible()
      await card.getByRole('button', { name: 'Cancel' }).click()
      await expect(card).toContainText('Off.')
      // Started again and left: a reload shows it still off.
      await card.getByRole('button', { name: 'Turn on two-step sign-in' }).click()
      await expect(card.getByRole('img')).toBeVisible()
      await page.reload()
      await expect(card).toContainText('Off.')
    })
  })
})
