import { expect, test, type Page } from '@playwright/test'
import { ACCOUNTS, authFile } from './accounts'
import {
  addDays,
  assignmentId,
  entriesOn,
  fieldVersion,
  longDay,
  planItemId,
  todayNY,
} from './data'
import { localSql, signedInClient } from './supabase'

/**
 * Backfill and the 7-day window, against the fixtures: math sessions 1–3 are past and
 * unlogged; violin has an entry dated and logged 8 days ago.
 */
const card = (page: Page, name: string) => page.getByRole('region', { name, exact: true })
const step = (page: Page) => page.getByRole('heading', { level: 2 })

async function deleteMathSession(session: number) {
  const client = await signedInClient(ACCOUNTS.student.email)
  const item = await planItemId(client, 'singapore-math', session)
  localSql(`delete from public.entries where plan_item_id = '${item}'`)
}

test.describe('@backfill late logs and locked entries', () => {
  test.use({ storageState: authFile('student') })
  test.describe.configure({ mode: 'serial' })

  // Before each test and after the last, back to the fixtures' picture.
  test.afterAll(restore)
  test.beforeEach(restore)

  async function restore() {
    await deleteMathSession(1)
    await deleteMathSession(3)
    const client = await signedInClient(ACCOUNTS.student.email)
    localSql(
      `delete from public.entries where assignment_id = '${await assignmentId(client, 'violin')}' and date = '${addDays(todayNY(), -1)}'`,
    )
  }

  test('missed sessions are listed, and one can be logged for the day it was done', async ({
    page,
  }) => {
    await page.goto('today')
    const math = card(page, 'Singapore Math')
    const missed = math.getByRole('region', { name: '3 earlier sessions to log' })
    // Folded under one line until opened.
    await expect(missed.getByRole('listitem')).toHaveCount(0)
    await missed.getByText('3 earlier sessions to log').click()
    await expect(missed.getByRole('listitem')).toHaveCount(3)
    await expect(missed.getByRole('listitem').first()).toContainText('Pages 5–13')

    await missed.getByRole('link', { name: /^Log .*: Pages 5–13$/ }).click()
    await expect(page.getByRole('progressbar', { name: 'Progress' })).toBeVisible()
    const yesterday = addDays(todayNY(), -1)
    await page.getByLabel('Done on').fill(yesterday)
    // Session 1 reads the examples, then has problems on p. 13.
    await expect(step(page)).toContainText('Did you complete the problems on the pages?')
    await page.getByText('Yes', { exact: true }).click()

    const answers: Record<string, string> = { Minutes: '25' }
    for (;;) {
      const label = (await step(page).innerText()).replace(/\s*optional$/, '')
      const answer = answers[label]
      if (answer) await page.keyboard.type(answer)
      const button = page.getByRole('button', { name: /^(Next|Save)$/ })
      const text = await button.innerText()
      await button.click()
      if (text.includes('Save')) break
    }
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()

    const client = await signedInClient(ACCOUNTS.student.email)
    // (Session 4, yesterday's, was logged on its day by the fixtures.)
    await expect
      .poll(async () =>
        (await entriesOn(client, 'singapore-math', yesterday)).map((e) => e.plan_item_id),
      )
      .toContain(await planItemId(client, 'singapore-math', 1))
    await expect(math.getByRole('region', { name: '2 earlier sessions to log' })).toBeVisible()
  })

  test('the violin week strip logs a day that was missed', async ({ page }) => {
    await page.goto('today')
    const yesterday = addDays(todayNY(), -1)
    const week = card(page, 'Violin').getByRole('navigation', { name: 'Last 7 days' })
    await expect(week.getByRole('link')).toHaveCount(7)
    await week.getByRole('link', { name: `${longDay(yesterday)}: Not logged` }).click()

    await expect(page.getByRole('progressbar', { name: 'Progress' })).toBeVisible()
    await expect(step(page)).toContainText('Did you practice today?')
    await page.keyboard.press('y')
    await page.keyboard.press('Enter')
    await page.keyboard.type('scales in G')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()

    const client = await signedInClient(ACCOUNTS.student.email)
    await expect
      .poll(async () => (await entriesOn(client, 'violin', yesterday)).map((e) => e.data))
      .toEqual([{ practiced: true, focus: 'scales in G' }])
    await expect(week.getByRole('link', { name: /: Done$/ })).not.toHaveCount(0)
  })

  test('an entry logged more than 7 days ago opens read-only', async ({ page }) => {
    const client = await signedInClient(ACCOUNTS.student.email)
    const violin = await assignmentId(client, 'violin')
    await page.goto(`log/${violin}?date=${addDays(todayNY(), -8)}`)
    await expect(
      page.getByText('Locked: entries can be changed for 7 days after they’re logged.'),
    ).toBeVisible()
    await expect(page.getByText('long, even bows on the A string')).toBeVisible()
    await expect(page.getByRole('button', { name: /Next|Save/ })).toHaveCount(0)
  })

  test('an edit that reaches the server after the lock is kept on the device, with the reason', async ({
    page,
  }) => {
    // Log session 3 now, open it for editing, then let 8 days "pass" before saving.
    const client = await signedInClient(ACCOUNTS.student.email)
    const math = await assignmentId(client, 'singapore-math')
    const session3 = await planItemId(client, 'singapore-math', 3)
    const { error } = await client.from('entries').insert({
      assignment_id: math,
      plan_item_id: session3,
      field_version: await fieldVersion(client, 'singapore-math'),
      date: todayNY(),
      data: { completed: true, struggled: [], minutes: 20 },
    })
    expect(error).toBeNull()
    await page.goto(`log/${math}/${session3}`)
    await expect(page.getByRole('progressbar', { name: 'Progress' })).toBeVisible()
    localSql(
      `update public.entries set created_at = now() - interval '8 days' where plan_item_id = '${session3}'`,
    )

    while (!(await step(page).innerText()).startsWith('Minutes')) {
      await page.getByRole('button', { name: 'Next' }).click()
    }
    await page.getByRole('textbox', { name: 'Minutes' }).fill('35')
    for (;;) {
      const button = page.getByRole('button', { name: /^(Next|Save)$/ })
      const text = await button.innerText()
      await button.click()
      if (text.includes('Save')) break
    }

    await expect(page.getByText('Couldn’t sync 1 change')).toBeVisible()
    await page.getByText('Couldn’t sync 1 change').click()
    await expect(
      page.getByText(
        'An entry: Locked: an entry can only be changed for 7 days after it’s logged.',
      ),
    ).toBeVisible()
    // The server still has the original; the change waits on this device.
    const { data } = await client.from('entries').select('data').eq('plan_item_id', session3)
    expect((data as { data: { minutes: number } }[])[0]?.data.minutes).toBe(20)
  })
})
