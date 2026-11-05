import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { ACCOUNTS, authFile, signIn } from './accounts'

test.describe('signed out', () => {
  test('the login page offers only email and password', async ({ page }) => {
    await page.goto('login')
    await expect(page.getByRole('heading', { level: 1, name: 'Practice tracker' })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByText('Forgot it? Ask your admin to reset it.')).toBeVisible()
    await expect(page.getByRole('link')).toHaveCount(0)
    await expect(page.getByText(/sign up|create account|magic link/i)).toHaveCount(0)
  })

  test('a wrong password is refused with a clear message', async ({ page }) => {
    await signIn(page, ACCOUNTS.student.email, 'not-the-password')
    await expect(page.getByRole('alert')).toHaveText(
      'That email and password don’t match an account.',
    )
    await expect(page).toHaveURL(/\/login$/)
  })

  test('an empty form says what is missing', async ({ page }) => {
    await page.goto('login')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toHaveText('Enter your email and password.')
    await page.getByLabel('Email').fill(ACCOUNTS.student.email)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toHaveText('Enter your password.')
  })

  test('a signed-out visitor is sent to sign in', async ({ page }) => {
    await page.goto('today')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('the login page passes an accessibility scan', async ({ page }) => {
    await page.goto('login')
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })
})

test.describe('signing out', () => {
  test.use({ storageState: authFile('viewer') })

  test('returns to the login page and stays signed out', async ({ page }) => {
    await page.goto('')
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)
    await page.goto('overview')
    await expect(page).toHaveURL(/\/login$/)
  })
})
