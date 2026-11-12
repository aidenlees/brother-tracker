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
    for (const path of ['overview', 'struggles', 'retries', 'people', 'export']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/today$/)
    }
  })
})

test.describe('deep links', () => {
  test.use({ storageState: authFile('admin') })

  test('load directly and unknown paths say so', async ({ page }) => {
    await page.goto('builder')
    await expect(page.getByRole('heading', { level: 1, name: 'Trackers' })).toBeVisible()
    await page.goto('no-such-page')
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
  })
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.describe('the admin', () => {
    test.use({ storageState: authFile('admin') })

    test('folds the screens into a menu that closes once one is chosen', async ({ page }) => {
      await page.goto('overview')
      const nav = page.getByRole('navigation', { name: 'Main' })
      const menu = nav.getByRole('button', { name: 'Menu' })
      await expect(menu).toHaveAttribute('aria-expanded', 'false')
      await expect(nav.getByRole('link', { name: 'Tasks' })).toBeHidden()
      await menu.click()
      await expect(menu).toHaveAttribute('aria-expanded', 'true')
      await expect(nav.getByRole('link')).toHaveText([...ACCOUNTS.admin.nav])
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
      expect(results.violations).toEqual([])
      await nav.getByRole('link', { name: 'Tasks' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Tasks' })).toBeVisible()
      await expect(menu).toHaveAttribute('aria-expanded', 'false')
      // Escape closes it too.
      await menu.click()
      await page.keyboard.press('Escape')
      await expect(menu).toHaveAttribute('aria-expanded', 'false')
    })
  })

  test.describe('a student', () => {
    test.use({ storageState: authFile('student') })

    test('keeps the tabs: three screens fit', async ({ page }) => {
      await page.goto('today')
      const nav = page.getByRole('navigation', { name: 'Main' })
      await expect(nav.getByRole('button', { name: 'Menu' })).toHaveCount(0)
      await expect(nav.getByRole('link')).toHaveText([...ACCOUNTS.student.nav])
    })
  })
})
