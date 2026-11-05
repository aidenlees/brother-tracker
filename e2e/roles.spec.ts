import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { ACCOUNTS, authFile, ROLES } from './accounts'

for (const role of ROLES) {
  const account = ACCOUNTS[role]

  test.describe(`as ${role}`, () => {
    test.use({ storageState: authFile(role) })

    test(`lands on ${account.landing} and sees only their screens`, async ({ page }) => {
      await page.goto('')
      await expect(page).toHaveURL(account.path)
      await expect(page.getByRole('heading', { level: 1, name: account.landing })).toBeVisible()
      await expect(page.getByText(account.name, { exact: true })).toBeVisible()
      const nav = page.getByRole('navigation', { name: 'Main' })
      await expect(nav.getByRole('link')).toHaveText([...account.nav])
      await expect(nav.getByRole('link', { name: account.landing })).toHaveAttribute(
        'aria-current',
        'page',
      )
    })

    test('the landing screen passes an accessibility scan', async ({ page }) => {
      await page.goto('')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
      expect(results.violations).toEqual([])
    })
  })
}

test.describe('screens a role cannot use', () => {
  test.use({ storageState: authFile('student') })

  test('send a student back to Today', async ({ page }) => {
    for (const path of ['overview', 'struggles', 'people', 'export']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/today$/)
    }
  })
})

test.describe('deep links', () => {
  test.use({ storageState: authFile('admin') })

  test('load directly and unknown paths say so', async ({ page }) => {
    await page.goto('people')
    await expect(page.getByRole('heading', { level: 1, name: 'People' })).toBeVisible()
    await page.goto('no-such-page')
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
  })
})
