import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { ACCOUNTS, authFile } from './accounts'
import { addDays, assignmentId, clearEntries, entriesOn, planItemId, todayNY } from './data'
import { signedInClient } from './supabase'

/**
 * The math log flow, against the fixtures: session 6 (pp. 31–32: problems 3–6) is today,
 * session 1 (reading only) is past and unlogged, session 5 was logged two days ago with
 * p. 30 #2 checked as a struggle.
 */
test.describe('@log the math log flow', () => {
  test.use({ storageState: authFile('student') })
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async () => {
    await clearEntries(await signedInClient(ACCOUNTS.student.email), 'singapore-math', todayNY())
  })

  const step = (page: Page) => page.getByRole('heading', { level: 2 })
  const progress = (page: Page) => page.getByText(/^\d+ of \d+$/)
  const COMPLETED = 'Did you complete the problems on the pages?'
  const STRUGGLED = 'Which problems did you struggle with?'

  async function open(page: Page) {
    await page.goto('today')
    await page.getByRole('link', { name: 'Log this session' }).click()
    await expect(page.getByRole('progressbar', { name: 'Progress' })).toBeVisible()
    await expect(step(page)).toContainText(COMPLETED)
  }

  test('a whole session, by keyboard alone, makes a retry of each problem checked', async ({
    page,
  }) => {
    await open(page)
    await expect(progress(page)).toHaveText('1 of 3')
    // The page says where you are by topic; the pages are on Today.
    await expect(page.getByText('Solve by Assuming', { exact: true })).toBeVisible()
    await expect(page.getByText(/PDF|Practice pp\./)).toHaveCount(0)

    await page.keyboard.press('y')
    await page.keyboard.press('Enter')

    // One box per problem on the session's pages; Tab moves, Space checks, Enter goes on.
    await expect(step(page)).toContainText(STRUGGLED)
    await expect(progress(page)).toHaveText('2 of 3')
    await expect(page.getByRole('checkbox')).toHaveCount(4)
    await expect(page.getByRole('checkbox', { name: 'p. 31 #3' })).toBeFocused()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Space') // p. 31 #4
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Space') // p. 32 #6
    await expect(page.getByText('2 checked.')).toBeVisible()
    await page.keyboard.press('Enter')

    await expect(step(page)).toContainText('Minutes')
    await page.keyboard.type('45')
    await page.keyboard.press('Enter')

    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
    const math = page.getByRole('region', { name: 'Singapore Math' })
    await expect(math.getByText('· Synced')).toBeVisible()
    // With today's session saved, one line says what comes next.
    await expect(math.getByText(/^Next: .* · Pages 33–34$/)).toBeVisible()

    const client = await signedInClient(ACCOUNTS.student.email)
    const [entry] = await entriesOn(client, 'singapore-math', todayNY())
    expect(entry?.plan_item_id).toBe(await planItemId(client, 'singapore-math', 6))
    expect(entry?.data).toEqual({
      completed: true,
      struggled: ['p. 31 #4', 'p. 32 #6'],
      minutes: 45,
    })
    await expect
      .poll(async () => {
        const { data } = await client
          .from('followups')
          .select('label, due_date, status')
          .eq('entry_id', entry?.id ?? '')
          .order('label')
        return data
      })
      .toEqual([
        { label: 'p. 31 #4', due_date: addDays(todayNY(), 2), status: 'open' },
        { label: 'p. 32 #6', due_date: addDays(todayNY(), 2), status: 'open' },
      ])
  })

  test('a reading-only session asks about the reading, then the minutes', async ({ page }) => {
    const client = await signedInClient(ACCOUNTS.student.email)
    const math = await assignmentId(client, 'singapore-math')
    await page.goto(`log/${math}/${await planItemId(client, 'singapore-math', 1)}`)
    await expect(progress(page)).toHaveText('1 of 2')
    await expect(step(page)).toContainText('Did you finish the reading?')
    await page.keyboard.press('y')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(step(page)).toContainText('Minutes')
    await expect(page.getByRole('checkbox')).toHaveCount(0)
  })

  test('closing mid-way keeps the answers; Today offers to resume', async ({ page }) => {
    await open(page)
    await page.keyboard.press('y')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Space') // p. 31 #4
    await page.keyboard.press('Enter')
    await expect(step(page)).toContainText('Minutes')
    await page.keyboard.type('30')
    await page.waitForTimeout(500) // the draft is written 300 ms after a change

    await page.reload()
    await expect(step(page)).toContainText('Minutes')
    await expect(progress(page)).toHaveText('3 of 3')
    await expect(page.getByRole('textbox')).toHaveValue('30')
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('checkbox', { name: 'p. 31 #4' })).toBeChecked()

    await page.getByRole('link', { name: 'Back to Today' }).click()
    await expect(page.getByRole('link', { name: 'Resume logging' })).toBeVisible()
  })

  test('a required answer has to be given before going on', async ({ page }) => {
    await open(page)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('alert')).toHaveText(`${COMPLETED} is required`)
    await expect(step(page)).toContainText(COMPLETED)

    await page.keyboard.press('n')
    await page.keyboard.press('Enter')
    await expect(step(page)).toContainText(STRUGGLED)
    await page.keyboard.press('Enter') // none checked is an answer
    await expect(step(page)).toContainText('Minutes')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('alert')).toHaveText('Minutes is required')
  })

  test('an earlier session can be edited within its 7 days, keeping its retry', async ({
    page,
  }) => {
    const client = await signedInClient(ACCOUNTS.student.email)
    const math = await assignmentId(client, 'singapore-math')
    const session5 = await planItemId(client, 'singapore-math', 5)
    await page.goto(`log/${math}/${session5}`)
    await expect(step(page)).toContainText(COMPLETED)
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('checkbox', { name: 'p. 30 #2' })).toBeChecked()
    await page.getByRole('button', { name: 'Next' }).click()
    // The fixture logged 35 minutes; a re-run finds this test's last value instead.
    const box = page.getByRole('textbox', { name: 'Minutes' })
    await expect(box).toHaveValue(/^(35|40)$/)
    const minutes = (await box.inputValue()) === '40' ? 35 : 40
    await box.fill(String(minutes))
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
    await expect
      .poll(async () => {
        const { data } = await client.from('entries').select('data').eq('plan_item_id', session5)
        return (data as { data: { minutes: number } }[]).map((e) => e.data.minutes)
      })
      .toEqual([minutes])
    // Still checked, so its retry is the same one, not a second.
    const { data } = await client.from('followups').select('label').eq('label', 'p. 30 #2')
    expect(data).toHaveLength(1)
  })

  test('each step passes an accessibility scan', async ({ page }) => {
    await open(page)
    for (let i = 0; i < 3; i += 1) {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
      expect(results.violations).toEqual([])
      if (i === 0) await page.keyboard.press('y')
      if (i < 2) await page.getByRole('button', { name: 'Next' }).click()
    }
  })
})
