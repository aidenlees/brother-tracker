import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { ACCOUNTS, authFile, signIn } from './accounts'
import { addDays, todayNY } from './data'
import { localSql, signedInClient } from './supabase'

/**
 * People and the admin-users Edge Function (served locally by `supabase functions
 * serve`). Accounts the tests make use made-…@example.test and are removed afterwards.
 */
const forgetMade = () => {
  localSql(`delete from auth.users where email like 'made-%@example.test'`)
}

async function scan(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(results.violations).toEqual([])
}

test.describe('@people people', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(forgetMade)
  test.afterAll(forgetMade)

  test('only an admin may call admin-users', async () => {
    const anon = await fetch('http://127.0.0.1:54321/functions/v1/admin-users', {
      method: 'POST',
      body: JSON.stringify({ action: 'list' }),
    })
    expect(anon.status).toBe(401)
    for (const email of [ACCOUNTS.viewer.email, ACCOUNTS.student.email]) {
      const client = await signedInClient(email)
      const result: unknown = await client.functions.invoke('admin-users', {
        body: {
          action: 'create',
          email: 'made-sneaky@example.test',
          password: 'long-enough-1',
          displayName: 'Sneaky',
          role: 'admin',
        },
      })
      const context = (result as { error: { context?: Response } | null }).error?.context
      expect(context?.status).toBe(403)
    }
    const admin = await signedInClient(ACCOUNTS.admin.email)
    const { data } = await admin.functions.invoke<{ accounts: { email: string }[] }>(
      'admin-users',
      { body: { action: 'list' } },
    )
    expect(data?.accounts.map((a) => a.email)).toContain(ACCOUNTS.student.email)
    expect(data?.accounts.map((a) => a.email)).not.toContain('made-sneaky@example.test')
  })

  test.describe('the admin', () => {
    test.use({ storageState: authFile('admin') })

    test('sees everyone by role, with their trackers and links', async ({ page }) => {
      await page.goto('people')
      const students = page.getByRole('region', { name: 'Students' })
      await expect(students.getByRole('article', { name: /^Sam/ })).toContainText('Singapore Math')
      await expect(students.getByRole('article', { name: /^Sam/ })).toContainText('Seen by Jordan.')
      const jordan = page.getByRole('region', { name: 'Viewers' }).getByRole('article', {
        name: /^Jordan/,
      })
      await expect(jordan.getByRole('checkbox', { name: 'Sam' })).toBeChecked()
      await expect(jordan.getByRole('checkbox', { name: 'Riley' })).not.toBeChecked()
      const me = page
        .getByRole('region', { name: 'Admins' })
        .getByRole('article', { name: /^Alex/ })
      await expect(me).toContainText('You')
      // No disabling yourself, or changing your own role.
      await expect(me.getByRole('button', { name: 'Disable' })).toHaveCount(0)
      await expect(me.getByRole('button', { name: 'Change role' })).toHaveCount(0)
      await scan(page)
    })

    test('adds a student, gives them math from a later start, and a viewer to follow them', async ({
      page,
      browser,
    }) => {
      await page.goto('people')
      const add = page.getByRole('region', { name: 'Add a person' })
      await add.getByLabel('First name').fill('Robin')
      await add.getByLabel('Email').fill('made-robin@example.test')
      await add.getByText('Student', { exact: true }).click()
      const password = await add.getByLabel('Temporary password').inputValue()
      expect(password).toHaveLength(14)
      await add.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(add.getByRole('status')).toContainText(
        `Robin can sign in now with made-robin@example.test and the password ${password}.`,
      )

      // Math from a week on: the plan shifts with it.
      const robin = page
        .getByRole('region', { name: 'Students' })
        .getByRole('article', { name: /^Robin/ })
      await expect(robin).toContainText('never signed in')
      const start = addDays(todayNY(), 7)
      const assign = robin.getByRole('form', { name: 'Give Robin a tracker' })
      await assign.getByLabel('Tracker').selectOption({ label: 'Singapore Math' })
      await assign.getByLabel('Starts').fill(start)
      await assign.getByRole('button', { name: 'Assign' }).click()
      await expect(robin.getByRole('listitem').filter({ hasText: 'Singapore Math' })).toBeVisible()

      // Jordan follows Robin too.
      const jordan = page.getByRole('region', { name: 'Viewers' }).getByRole('article', {
        name: /^Jordan/,
      })
      await jordan.getByRole('checkbox', { name: 'Robin' }).check()
      await expect(robin).toContainText('Seen by Jordan.')
      await scan(page)

      // Robin signs in with the temporary password, and their plan starts on that day.
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
      const robinPage = await context.newPage()
      await signIn(robinPage, 'made-robin@example.test', password)
      await expect(robinPage.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
      const client = await signedInClient('made-robin@example.test', password)
      const { data } = await client.from('plan_items').select('date').order('date').limit(1)
      expect(data?.[0]?.date).toBe(start)
      await context.close()

      await jordan.getByRole('checkbox', { name: 'Robin' }).uncheck()
      await expect(robin).toContainText('No viewer follows them yet.')
    })

    test('sets a new password, disables and enables, renames', async ({ page, browser }) => {
      await page.goto('people')
      const robin = page
        .getByRole('region', { name: 'Students' })
        .getByRole('article', { name: /^Robin/ })
      await robin.getByRole('button', { name: 'New password' }).click()
      const field = robin.getByLabel('Temporary password')
      await field.fill('made-new-password-1')
      await robin.getByRole('button', { name: 'Set password' }).click()
      await expect(robin.getByRole('status')).toContainText('made-new-password-1')

      await robin.getByRole('button', { name: 'Disable' }).click()
      await robin
        .getByRole('form', { name: 'Disable Robin' })
        .getByRole('button', { name: 'Disable' })
        .click()
      await expect(robin).toContainText('Disabled: can’t sign in')
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
      const attempt = await context.newPage()
      await signIn(attempt, 'made-robin@example.test', 'made-new-password-1')
      await expect(attempt.getByRole('alert')).toContainText('This account is turned off.')

      await robin.getByRole('button', { name: 'Enable' }).click()
      await robin
        .getByRole('form', { name: 'Enable Robin' })
        .getByRole('button', { name: 'Enable' })
        .click()
      await expect(robin).not.toContainText('Disabled')
      await signIn(attempt, 'made-robin@example.test', 'made-new-password-1')
      await expect(attempt.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
      await context.close()

      await robin.getByRole('button', { name: 'Rename' }).click()
      await robin.getByLabel('First name').fill('Robbie')
      await robin.getByRole('button', { name: 'Save' }).click()
      await expect(
        page.getByRole('region', { name: 'Students' }).getByRole('article', { name: /^Robbie/ }),
      ).toBeVisible()
    })

    test('changes a role only once nothing ties the person to the old one', async ({ page }) => {
      await page.goto('people')
      const robbie = page
        .getByRole('region', { name: 'Students' })
        .getByRole('article', { name: /^Robbie/ })
      await robbie.getByRole('button', { name: 'Change role' }).click()
      const form = robbie.getByRole('form', { name: 'Change Robbie’s role' })
      await form.getByText('Viewer', { exact: true }).click()
      await form.getByRole('button', { name: 'Change role' }).click()
      await expect(form.getByRole('alert')).toContainText(
        'Remove their trackers and viewer links first',
      )

      // A fresh account with nothing tied to it changes role at once.
      const add = page.getByRole('region', { name: 'Add a person' })
      await add.getByLabel('First name').fill('Casey')
      await add.getByLabel('Email').fill('made-casey@example.test')
      await add.getByText('Viewer', { exact: true }).click()
      await add.getByRole('button', { name: 'Add', exact: true }).click()
      const casey = page.getByRole('region', { name: 'Viewers' }).getByRole('article', {
        name: /^Casey/,
      })
      await casey.getByRole('button', { name: 'Change role' }).click()
      await casey
        .getByRole('form', { name: 'Change Casey’s role' })
        .getByText('Student', { exact: true })
        .click()
      await casey
        .getByRole('form', { name: 'Change Casey’s role' })
        .getByRole('button', { name: 'Change role' })
        .click()
      await expect(
        page.getByRole('region', { name: 'Students' }).getByRole('article', { name: /^Casey/ }),
      ).toBeVisible()
    })
  })
})
