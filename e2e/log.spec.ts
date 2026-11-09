import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { ACCOUNTS, authFile } from './accounts'
import { addDays, assignmentId, clearEntries, entriesOn, planItemId, todayNY } from './data'
import { localSql, signedInClient } from './supabase'

/**
 * The math log flow, against the fixtures: session 5 (pp. 32–35: problems 5–12) is today,
 * sessions 1–3 are past and unlogged, session 4 was logged yesterday with p. 30 #2
 * checked as a struggle, and session 6 (pp. 36–40) is tomorrow.
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
    await expect(page.getByRole('checkbox')).toHaveCount(8)
    await expect(page.getByRole('checkbox', { name: 'p. 32 #5' })).toBeFocused()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Space') // p. 32 #6
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Space') // p. 33 #8
    await expect(page.getByText('2 checked.')).toBeVisible()
    await page.keyboard.press('Enter')

    await expect(step(page)).toContainText('Minutes')
    await page.keyboard.type('45')
    await page.keyboard.press('Enter')

    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
    const math = page.getByRole('region', { name: 'Singapore Math' })
    await expect(math.getByText('· Synced')).toBeVisible()
    // With today's session saved, one line says what comes next.
    await expect(math.getByText(/^Next: .* · Pages 36–40$/)).toBeVisible()

    const client = await signedInClient(ACCOUNTS.student.email)
    const [entry] = await entriesOn(client, 'singapore-math', todayNY())
    expect(entry?.plan_item_id).toBe(await planItemId(client, 'singapore-math', 5))
    expect(entry?.data).toEqual({
      completed: true,
      struggled: ['p. 32 #6', 'p. 33 #8'],
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
        { label: 'p. 32 #6', due_date: addDays(todayNY(), 2), status: 'open' },
        { label: 'p. 33 #8', due_date: addDays(todayNY(), 2), status: 'open' },
      ])
  })

  test('a log made by mistake is cleared from Edit, with its retry', async ({ page }) => {
    await open(page)
    await page.keyboard.press('y')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Space') // p. 32 #5
    await page.keyboard.press('Enter')
    await page.keyboard.type('20')
    await page.keyboard.press('Enter')
    const math = page.getByRole('region', { name: 'Singapore Math' })
    await expect(math.getByText('· Synced')).toBeVisible()
    const client = await signedInClient(ACCOUNTS.student.email)
    const [entry] = await entriesOn(client, 'singapore-math', todayNY())
    await expect
      .poll(async () => {
        const { data } = await client
          .from('followups')
          .select('label')
          .eq('entry_id', entry?.id ?? '')
        return data
      })
      .toEqual([{ label: 'p. 32 #5' }])

    await math.getByRole('link', { name: 'Edit' }).click()
    await expect(step(page)).toContainText(COMPLETED)
    await page.getByRole('button', { name: 'Clear this log' }).click()
    const ask = page.getByRole('group', { name: /^Clear this log\?/ })
    await expect(ask).toHaveAccessibleName(
      'Clear this log? It’s removed for good, with its 1 retry.',
    )
    // Enter keeps it: the focus starts on "Keep it", and the flow doesn't move on.
    await page.keyboard.press('Enter')
    await expect(ask).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Clear this log' })).toBeFocused()
    await expect(step(page)).toContainText(COMPLETED)

    await page.getByRole('button', { name: 'Clear this log' }).click()
    await page.getByRole('button', { name: 'Clear it' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'Log cleared.' })).toBeVisible()
    await expect(math.getByRole('link', { name: 'Log this session' })).toBeVisible()
    await expect.poll(async () => entriesOn(client, 'singapore-math', todayNY())).toEqual([])
    const { data: retries } = await client
      .from('followups')
      .select('id')
      .eq('entry_id', entry?.id ?? '')
    expect(retries).toEqual([])
  })

  test('a log past its 7 days says the admin can clear it', async ({ page }) => {
    const client = await signedInClient(ACCOUNTS.student.email)
    const violin = await assignmentId(client, 'violin')
    await page.goto(`log/${violin}?date=${addDays(todayNY(), -8)}`)
    await expect(page.getByText(/^Locked:/)).toBeVisible()
    await expect(page.getByText('Logged by mistake? Ask your admin to clear it.')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Clear this/ })).toHaveCount(0)
  })

  test('tomorrow’s session, done early, is logged today and shown as done', async ({ page }) => {
    const client = await signedInClient(ACCOUNTS.student.email)
    const tomorrow = await planItemId(client, 'singapore-math', 6)
    await open(page)
    // Log today's first, so Today's card moves on to what's next.
    await page.keyboard.press('y')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.type('40')
    await page.keyboard.press('Enter')
    const math = page.getByRole('region', { name: 'Singapore Math' })
    await expect(math.getByText(/^Next: .* · Pages 36–40$/)).toBeVisible()

    await math.getByRole('link', { name: 'Done it early? Log it' }).click()
    await expect(page.getByText(/^Planned for .*\. You’re logging it early\.$/)).toBeVisible()
    await expect(page.getByText('Looking for a Pattern', { exact: true })).toBeVisible()
    await page.keyboard.press('y')
    await page.keyboard.press('Enter')
    await page
      .locator('label', { has: page.getByRole('checkbox', { name: 'p. 36 #1(a)' }) })
      .click()
    await page.keyboard.press('Enter')
    await page.keyboard.type('50')
    await page.keyboard.press('Enter')

    // Back on Today: it says so, and Next moves on to the session after.
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
    await expect(math.getByText(/^Logged early: .* · Pages 36–40$/)).toBeVisible()
    await expect(math.getByText(/^Next: .* · Pages 41–45$/)).toBeVisible()

    // The entry is dated today (when it was done), for tomorrow's session; its retry is
    // due two days after the work, not after the planned day.
    await expect
      .poll(async () => {
        const entries = await entriesOn(client, 'singapore-math', todayNY())
        return entries.find((e) => e.plan_item_id === tomorrow)?.data
      })
      .toEqual({ completed: true, struggled: ['p. 36 #1(a)'], minutes: 50 })
    const entries = await entriesOn(client, 'singapore-math', todayNY())
    const early = entries.find((e) => e.plan_item_id === tomorrow)
    await expect
      .poll(async () => {
        const { data } = await client
          .from('followups')
          .select('label, due_date')
          .eq('entry_id', early?.id ?? '')
        return data
      })
      .toEqual([{ label: 'p. 36 #1(a)', due_date: addDays(todayNY(), 2) }])
  })

  test('before the plan starts, a session can’t be logged early (entries start on day one)', async ({
    page,
  }) => {
    const client = await signedInClient(ACCOUNTS.student.email)
    const math = await assignmentId(client, 'singapore-math')
    const tomorrow = await planItemId(client, 'singapore-math', 6)
    const { data } = await client.from('assignments').select('start_date').eq('id', math).single()
    const start = (data as { start_date: string }).start_date
    localSql(
      `update public.assignments set start_date = '${addDays(todayNY(), 1)}' where id = '${math}'`,
    )
    try {
      await page.goto(`session/${math}/${tomorrow}`)
      await expect(
        page.getByText(/Sessions can be logged from .*, when the plan starts\.$/),
      ).toBeVisible()
      await expect(page.getByRole('link', { name: 'Log it early' })).toHaveCount(0)
      await page.goto(`log/${math}/${tomorrow}`)
      await expect(page.getByText(/^You can log days from /)).toBeVisible()
    } finally {
      localSql(`update public.assignments set start_date = '${start}' where id = '${math}'`)
    }
  })

  test('closing mid-way keeps the answers; Today offers to resume', async ({ page }) => {
    await open(page)
    await page.keyboard.press('y')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Space') // p. 32 #6
    await page.keyboard.press('Enter')
    await expect(step(page)).toContainText('Minutes')
    await page.keyboard.type('30')
    await page.waitForTimeout(500) // the draft is written 300 ms after a change

    await page.reload()
    await expect(step(page)).toContainText('Minutes')
    await expect(progress(page)).toHaveText('3 of 3')
    await expect(page.getByRole('textbox')).toHaveValue('30')
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('checkbox', { name: 'p. 32 #6' })).toBeChecked()

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
    const session4 = await planItemId(client, 'singapore-math', 4)
    await page.goto(`log/${math}/${session4}`)
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
        const { data } = await client.from('entries').select('data').eq('plan_item_id', session4)
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
