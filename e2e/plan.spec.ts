import { expect, test, type Page } from '@playwright/test'
import { ACCOUNTS, authFile } from './accounts'
import { clearEntries, planItemId, todayNY } from './data'
import { signedInClient } from './supabase'

/**
 * The plan editor (admin), against the fixtures: Sam's math session 5 (of 54) is today.
 * Every test puts the plan back as it found it (they share the fixtures).
 */
test.describe('@plan the admin’s plan editor', () => {
  test.use({ storageState: authFile('admin') })
  test.describe.configure({ mode: 'serial' })

  // Today's session not logged yet, whatever an earlier spec left.
  test.beforeEach(async () => {
    await clearEntries(await signedInClient(ACCOUNTS.student.email), 'singapore-math', todayNY())
  })

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
    await expect(page.getByText(/Session 5 · Solve by Assuming/).first()).toBeVisible()
  }

  async function studentToday(browser: import('@playwright/test').Browser) {
    const student = await browser.newContext({ storageState: authFile('student') })
    const today = await student.newPage()
    await today.goto('today')
    return { math: today.getByRole('region', { name: 'Singapore Math', exact: true }), student }
  }

  test('“Later” moves today’s session and the rest; the student sees it; Undo puts it back', async ({
    page,
    browser,
  }) => {
    await openSam(page)
    await page
      .getByRole('button', {
        name: /^Move .*Session 5 · Solve by Assuming and every later session one plan day later$/,
      })
      .click()
    await expect(
      page.getByRole('status').filter({ hasText: /^Moved 50 sessions later/ }),
    ).toBeVisible()
    await expect.poll(async () => (await session(5)).date > todayNY()).toBe(true)

    // The student's Today no longer has a session today.
    const { math, student } = await studentToday(browser)
    await expect(math.getByText('No session today.')).toBeVisible()
    await expect(math.getByText(/^Next: .* · Pages 32–35$/)).toBeVisible()
    await student.close()

    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Moved back.' })).toBeVisible()
    await expect.poll(async () => (await session(5)).date).toBe(todayNY())
  })

  test('a day off moves that day’s work and everything after it back a day', async ({
    page,
    browser,
  }) => {
    await openSam(page)
    const dayOff = page.getByRole('form', { name: 'Day off' })
    await expect(dayOff.getByLabel('Day off')).toHaveValue(todayNY())
    const tomorrow = (await session(6)).date
    await dayOff.getByRole('button', { name: 'Move the work back a day' }).click()
    await expect(
      page.getByRole('status').filter({
        hasText: /is a day off: its session and the 49 after it moved one plan day later/,
      }),
    ).toBeVisible()
    await expect.poll(async () => (await session(5)).date).toBe(tomorrow)

    const { math, student } = await studentToday(browser)
    await expect(math.getByText('No session today.')).toBeVisible()
    await student.close()

    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Moved back.' })).toBeVisible()
    await expect.poll(async () => (await session(5)).date).toBe(todayNY())
  })

  test('editing the pages changes the problem boxes; Reset brings back the baseline', async ({
    page,
  }) => {
    await openSam(page)
    const edit = page.getByRole('button', { name: /^Edit .*Session 8 · Working Backward$/ })
    await expect(page.getByText(/^Pages 46–50 · 6 problems · About 40 min$/)).toBeVisible()
    await edit.click()
    const form = page.getByRole('form', { name: /^Edit / })
    await expect(form.getByLabel('Last page')).toHaveValue('50')
    await form.getByLabel('Last page').fill('49')
    await expect(form.getByText(/^4 problem checkboxes: p\. 48 #1/)).toBeVisible()
    // The estimate follows the pages, and says when a day falls outside 30 to 60 minutes.
    await expect(form.getByText('About 30 min of work: under half an hour.')).toBeVisible()
    await form.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status').filter({ hasText: /^Saved / })).toBeVisible()
    await expect
      .poll(async () => (await session(8)).details.problems)
      .toEqual(['p. 48 #1', 'p. 48 #2', 'p. 49 #3', 'p. 49 #4'])

    await edit.click()
    await page.getByRole('button', { name: 'Reset to the baseline' }).click()
    await expect.poll(async () => (await session(8)).details.page_end).toBe(50)
    expect((await session(8)).details.problems).toEqual([
      'p. 48 #1',
      'p. 48 #2',
      'p. 49 #3',
      'p. 49 #4',
      'p. 50 #5',
      'p. 50 #6',
    ])
  })
})
