import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { authFile, PASSWORD, signIn } from './accounts'
import { addDays, todayNY } from './data'
import { localSql, signedInClient } from './supabase'

/**
 * Plans for any tracker (Phase 4): a tracker made in the builder that runs on sessions,
 * its sessions added on the Plan screen one at a time and pasted as a list, one deleted,
 * then the student logs today's and a hard problem becomes a retry. Reading is removed
 * before and after.
 */
const forgetReading = () => {
  const reading = `(select id from public.trackers where slug = 'reading')`
  const assignments = `(select id from public.assignments where tracker_id in ${reading})`
  localSql(`delete from public.entries where assignment_id in ${assignments}`)
  localSql(`delete from public.plan_items where assignment_id in ${assignments}`)
  localSql(`delete from public.assignments where tracker_id in ${reading}`)
  localSql(`delete from public.tracker_versions where tracker_id in ${reading}`)
  localSql(`delete from public.trackers where slug = 'reading'`)
}

async function scan(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(results.violations).toEqual([])
}

test.describe('@plans plans for any tracker', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(forgetReading)
  test.afterAll(forgetReading)
  test.use({ storageState: authFile('admin') })

  test('a tracker on a plan, with its problems and retries', async ({ page }) => {
    await page.goto('builder')
    const make = page.getByRole('region', { name: 'New tracker' })
    await make.getByLabel('Name').fill('Reading')
    await make.getByRole('button', { name: 'Start' }).click()
    await page.getByText('Sessions on a plan', { exact: true }).click()

    const add = page.getByRole('form', { name: 'Add a question' })
    await add.getByLabel('A new question').fill('Which problems were hard?')
    await add.getByLabel('Answered as').selectOption({ label: 'The session’s problems' })
    await add.getByRole('button', { name: 'Add' }).click()
    await page.getByLabel(/^Make a retry of each problem ticked/).check()

    // The preview runs on a sample session, so the problem boxes show.
    const preview = page.getByRole('region', { name: 'Preview' })
    await preview.getByRole('textbox', { name: 'What did you do?' }).fill('Read chapter 1')
    await preview.getByRole('button', { name: 'Next' }).click()
    await preview.getByRole('button', { name: 'Next' }).click()
    await expect(preview.getByRole('checkbox', { name: 'p. 12 #1' })).toBeVisible()

    await page
      .getByRole('region', { name: 'Weekly numbers' })
      .getByRole('button', { name: 'Add Solved on my own' })
      .click()
    await page.getByRole('button', { name: 'Publish' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Published.' })).toBeVisible()

    await page.goto('people')
    const riley = page
      .getByRole('region', { name: 'Students' })
      .getByRole('article', { name: /^Riley/ })
    const give = riley.getByRole('form', { name: 'Give Riley a tracker' })
    await give.getByLabel('Tracker').selectOption({ label: 'Reading' })
    await give.getByRole('button', { name: 'Assign' }).click()
    await expect(riley.getByRole('listitem').filter({ hasText: 'Reading' })).toBeVisible()
  })

  test('sessions added one at a time and pasted, and one deleted', async ({ page }) => {
    await page.goto('plan')
    await page.getByLabel('Student and tracker').selectOption({ label: 'Riley · Reading' })
    await expect(page.getByText('No sessions yet. Add one, or paste a list.')).toBeVisible()

    const one = page.getByRole('form', { name: 'Add one session' })
    await one.getByLabel('Topic').fill('Chapter 1')
    await one.getByLabel('Pages (optional)').fill('1-4')
    await one.getByLabel('Problems (optional), one per line').fill('p. 2 #1\np. 3 #2')
    await one.getByRole('button', { name: 'Add the session' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Added Chapter 1' })).toBeVisible()

    await page.getByText('Paste a list', { exact: true }).click()
    const paste = page.getByRole('form', { name: 'Paste a list of sessions' })
    const days = [1, 2, 3].map((n) => addDays(todayNY(), n))
    await paste
      .getByLabel('One session per row: day, topic, pages, problems')
      .fill(
        [
          `${days[0] ?? ''}\tChapter 2\t5-8`,
          `${days[1] ?? ''}, Chapter 3, 9-12`,
          `${days[2] ?? ''}, Chapter 4`,
        ].join('\n'),
      )
    await expect(paste.getByText('3 sessions read.')).toBeVisible()
    await scan(page)
    await paste.getByRole('button', { name: 'Add 3 sessions' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Added 3 sessions.' })).toBeVisible()
    await expect(page.getByText('Session 4 · Chapter 4')).toBeVisible()

    await page.getByRole('button', { name: /^Delete .*Session 4 · Chapter 4$/ }).click()
    const confirm = page.getByRole('group', { name: 'Delete Session 4 · Chapter 4' })
    await expect(confirm.getByRole('button', { name: 'Keep it' })).toBeFocused()
    await confirm.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText('Session 4 · Chapter 4')).toHaveCount(0)
  })

  test('the student logs today’s session, and a hard problem becomes a retry', async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()
    await signIn(page, 'student2@example.test', PASSWORD)
    const card = page.getByRole('region', { name: 'Reading', exact: true })
    await expect(card).toContainText('Pages 1–4')
    await card.getByRole('link', { name: /^Log this session/ }).click()
    await page.getByRole('textbox', { name: 'What did you do?' }).fill('Read it twice')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.locator('label', { has: page.getByRole('checkbox', { name: 'p. 3 #2' }) }).click()
    await expect(page.getByRole('checkbox', { name: 'p. 3 #2' })).toBeChecked()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()

    const client = await signedInClient('student2@example.test')
    await expect
      .poll(async () => {
        const { data } = await client
          .from('followups')
          .select('label, due_date')
          .eq('label', 'p. 3 #2')
        return data
      })
      .toEqual([{ label: 'p. 3 #2', due_date: addDays(todayNY(), 2) }])
    await context.close()
  })
})
