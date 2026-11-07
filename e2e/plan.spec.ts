import { expect, test, type Page } from '@playwright/test'
import { ACCOUNTS, authFile } from './accounts'
import { planItemId, todayNY } from './data'
import { signedInClient } from './supabase'

/**
 * The plan editor (admin), against the fixtures: Sam's math session 6 is today. Every
 * test puts the plan back as it found it (they share the fixtures).
 */
test.describe('@plan the admin’s plan editor', () => {
  test.use({ storageState: authFile('admin') })
  test.describe.configure({ mode: 'serial' })

  type Session = { date: string; details: { page_end?: number; problems?: string[] } }

  async function session(n: number): Promise<Session> {
    const client = await signedInClient(ACCOUNTS.student.email)
    const id = await planItemId(client, 'singapore-math', n)
    const { data, error } = await client
      .from('plan_items')
      .select('date, details')
      .eq('id', id)
      .single()
    if (error) throw error
    const row: unknown = data
    return row as Session
  }

  async function openSam(page: Page) {
    await page.goto('plan')
    await expect(page.getByRole('heading', { level: 1, name: 'Plan' })).toBeVisible()
    await page.getByLabel('Student and tracker').selectOption({ label: 'Sam · Singapore Math' })
    await expect(page.getByText(/Session 6 · Solve by Assuming/).first()).toBeVisible()
  }

  test('“Later” moves today’s session and the rest; the student sees it; Undo puts it back', async ({
    page,
    browser,
  }) => {
    await openSam(page)
    await page
      .getByRole('button', {
        name: /^Move .*Session 6 · Solve by Assuming and every later session one plan day later$/,
      })
      .click()
    await expect(
      page.getByRole('status').filter({ hasText: /^Moved 75 sessions later/ }),
    ).toBeVisible()
    await expect.poll(async () => (await session(6)).date > todayNY()).toBe(true)

    // The student's Today no longer has a session today.
    const student = await browser.newContext({ storageState: authFile('student') })
    const today = await student.newPage()
    await today.goto('today')
    const math = today.getByRole('region', { name: 'Singapore Math', exact: true })
    await expect(math.getByText('No session today.')).toBeVisible()
    await expect(math.getByText(/^Next: .* · Pages 31–32$/)).toBeVisible()
    await student.close()

    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Moved back.' })).toBeVisible()
    await expect.poll(async () => (await session(6)).date).toBe(todayNY())
  })

  test('editing the pages changes the problem boxes; Reset brings back the baseline', async ({
    page,
  }) => {
    await openSam(page)
    const edit = page.getByRole('button', { name: /^Edit .*Session 7 · Solve by Assuming$/ })
    await edit.click()
    const form = page.getByRole('form', { name: /^Edit / })
    await expect(form.getByLabel('Last page')).toHaveValue('34')
    await form.getByLabel('Last page').fill('35')
    await expect(form.getByText(/^6 problem checkboxes: p\. 33 #7/)).toBeVisible()
    await form.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status').filter({ hasText: /^Saved / })).toBeVisible()
    await expect
      .poll(async () => (await session(7)).details.problems)
      .toEqual(['p. 33 #7', 'p. 33 #8', 'p. 34 #9', 'p. 34 #10', 'p. 35 #11', 'p. 35 #12'])

    await edit.click()
    await page.getByRole('button', { name: 'Reset to the baseline' }).click()
    await expect.poll(async () => (await session(7)).details.page_end).toBe(34)
    expect((await session(7)).details.problems).toEqual([
      'p. 33 #7',
      'p. 33 #8',
      'p. 34 #9',
      'p. 34 #10',
    ])
  })
})
