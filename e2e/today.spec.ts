import { expect, test, type Page } from '@playwright/test'
import { ACCOUNTS, authFile } from './accounts'
import { clearEntries, entriesOn, todayNY } from './data'
import { signedInClient } from './supabase'

/**
 * Today, against the fixtures (scripts/e2e-fixtures.sql): the student has math session 6
 * today and violin; student2 is on a review day.
 */
const card = (page: Page, name: string) => page.getByRole('region', { name, exact: true })

test.describe('@today the math card', () => {
  test.use({ storageState: authFile('student') })

  test('shows today’s session with its printed and PDF pages, ready to log', async ({ page }) => {
    await page.goto('today')
    const math = card(page, 'Singapore Math')
    await expect(math.getByText('Session 6 · Solve by Assuming')).toBeVisible()
    await expect(math.getByText('Practice pp. 31-32', { exact: true })).toBeVisible()
    await expect(math.getByText('pp. 31–32 · PDF 33–34')).toBeVisible()
    await expect(math.getByRole('link', { name: 'Log this session' })).toHaveAttribute(
      'href',
      /\/log\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/,
    )
  })
})

test.describe('@violin the inline check-in', () => {
  test.use({ storageState: authFile('student') })
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async () => {
    await clearEntries(await signedInClient(ACCOUNTS.student.email), 'violin', todayNY())
  })

  test('Yes, a focus, Enter: saved at once, then synced', async ({ page }) => {
    await page.goto('today')
    const violin = card(page, 'Violin')
    await violin.getByText('Yes', { exact: true }).click()
    const focus = violin.getByRole('textbox', { name: 'One specific thing you focused on' })
    await expect(focus).toBeFocused()
    await focus.fill('clean shift to 3rd position')
    await focus.press('Enter')

    await expect(violin.getByText('clean shift to 3rd position')).toBeVisible()
    await expect(violin.getByText('· Synced')).toBeVisible()
    await expect(violin.getByText('Streak · 1 day')).toBeVisible()

    const client = await signedInClient(ACCOUNTS.student.email)
    await expect
      .poll(async () => (await entriesOn(client, 'violin', todayNY())).map((e) => e.data))
      .toEqual([{ practiced: true, focus: 'clean shift to 3rd position' }])

    await page.reload()
    await expect(card(page, 'Violin').getByText('clean shift to 3rd position')).toBeVisible()
  })

  test('No saves with one tap; Change edits the same entry', async ({ page }) => {
    await page.goto('today')
    const violin = card(page, 'Violin')
    await violin.getByText('No', { exact: true }).click()
    await expect(violin.getByText('· Synced')).toBeVisible()
    const client = await signedInClient(ACCOUNTS.student.email)
    await expect
      .poll(async () => (await entriesOn(client, 'violin', todayNY())).map((e) => e.data))
      .toEqual([{ practiced: false }])

    await violin.getByRole('button', { name: 'Change' }).click()
    await violin.getByText('Yes', { exact: true }).click()
    await violin.getByRole('textbox').fill('long bows')
    await violin.getByRole('textbox').press('Enter')
    await expect(violin.getByText('long bows')).toBeVisible()
    await expect
      .poll(async () => (await entriesOn(client, 'violin', todayNY())).map((e) => e.data))
      .toEqual([{ practiced: true, focus: 'long bows' }])
  })

  test('Yes without a focus says what’s missing', async ({ page }) => {
    await page.goto('today')
    const violin = card(page, 'Violin')
    await violin.getByText('Yes', { exact: true }).click()
    await violin.getByRole('button', { name: 'Save' }).click()
    await expect(violin.getByText('One specific thing you focused on is required')).toBeVisible()
    expect(
      await entriesOn(await signedInClient(ACCOUNTS.student.email), 'violin', todayNY()),
    ).toEqual([])
  })
})
