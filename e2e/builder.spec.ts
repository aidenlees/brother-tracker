import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { authFile, PASSWORD, signIn } from './accounts'
import { localSql } from './supabase'

/**
 * The tracker builder (Phase 4's test: "a third tracker is built in under 5 minutes with
 * no code"). The test builds Piano from a blank, tries it in the preview, publishes it,
 * gives it to Riley and sees it on Riley's Today, then edits it into a second version.
 * Piano is removed before and after.
 */
const forgetPiano = () => {
  const piano = `(select id from public.trackers where slug = 'piano')`
  const assignments = `(select id from public.assignments where tracker_id in ${piano})`
  localSql(`delete from public.entries where assignment_id in ${assignments}`)
  localSql(`delete from public.assignments where tracker_id in ${piano}`)
  localSql(`delete from public.tracker_versions where tracker_id in ${piano}`)
  localSql(`delete from public.trackers where slug = 'piano'`)
}

async function scan(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(results.violations).toEqual([])
}

test.describe('@builder tracker builder', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(forgetPiano)
  test.afterAll(forgetPiano)
  test.use({ storageState: authFile('admin') })

  test('lists every tracker with how it runs and who has it', async ({ page }) => {
    await page.goto('builder')
    const math = page.getByRole('article', { name: 'Singapore Math' })
    await expect(math).toContainText('Follows a plan')
    await expect(math).toContainText(/2 students/)
    await expect(page.getByRole('article', { name: 'Violin' })).toContainText('Every day')
    await expect(page.getByRole('article', { name: 'Tasks' })).toContainText('Tasks the admin adds')
    await scan(page)
  })

  test('builds Piano from a blank, tries it, publishes it, and Riley gets it', async ({
    page,
    browser,
  }) => {
    const started = Date.now()
    await page.goto('builder')
    const make = page.getByRole('region', { name: 'New tracker' })
    await make.getByLabel('Name').fill('Piano')
    await make.getByRole('button', { name: 'Start' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'New tracker' })).toBeVisible()

    // About: an icon, a colour, checked in right on its Today card.
    await page.getByRole('radio', { name: 'Music' }).check({ force: true })
    await page.getByText('Plum', { exact: true }).click()
    await page.getByText('Right on its card', { exact: true }).click()

    // Questions: a yes/no first, the blank's "What did you do?" asked only on a yes,
    // "What did you struggle with?" removed, and minutes.
    const questions = page.getByRole('list', { name: 'Questions' })
    const add = page.getByRole('form', { name: 'Add a question' })
    await add.getByLabel('A new question').fill('Did you practice today?')
    await add.getByLabel('Answered as').selectOption({ label: 'Yes or no' })
    await add.getByRole('button', { name: 'Add' }).click()
    await expect(questions.getByRole('listitem')).toHaveCount(3)
    await page.getByRole('button', { name: 'Move Question 3 up' }).click()
    await page.getByRole('button', { name: 'Move Question 2 up' }).click()
    await expect(questions.getByRole('listitem').first()).toHaveAccessibleName(
      'Question 1: Did you practice today?',
    )
    await page.getByRole('button', { name: 'Remove Question 3' }).click()
    const did = questions.getByRole('listitem', { name: /^Question 2/ })
    await did.getByLabel('Asked').selectOption({ label: 'when “Did you practice today?” is yes' })
    await add.getByLabel('A new question').fill('Minutes')
    await add.getByLabel('Answered as').selectOption({ label: 'Minutes' })
    await add.getByRole('button', { name: 'Add' }).click()
    await expect(questions.getByRole('listitem')).toHaveCount(3)

    // The preview asks them in order, skips the conditional one on a no.
    const preview = page.getByRole('region', { name: 'Preview' })
    await expect(preview.getByRole('heading', { name: 'Did you practice today?' })).toBeVisible()
    await preview.getByText('No', { exact: true }).click()
    await preview.getByRole('button', { name: 'Next' }).click()
    await expect(preview.getByRole('heading', { name: 'Minutes' })).toBeVisible()
    await expect(preview.getByText('2 of 2')).toBeVisible()
    await preview.getByRole('button', { name: 'Back' }).click()
    await preview.getByText('Yes', { exact: true }).click()
    await preview.getByRole('button', { name: 'Next' }).click()
    await expect(preview.getByRole('heading', { name: 'What did you do?' })).toBeVisible()
    await preview.getByRole('button', { name: 'Next' }).click()
    await expect(preview.getByRole('alert')).toBeVisible()

    // Weekly numbers from what the questions allow.
    const numbers = page.getByRole('region', { name: 'Weekly numbers' })
    await numbers.getByRole('button', { name: 'Add Days' }).click()
    await numbers.getByRole('button', { name: 'Add Minutes' }).click()
    await expect(
      numbers.getByRole('list', { name: 'Weekly numbers' }).getByRole('listitem'),
    ).toHaveCount(2)
    await scan(page)

    await page.getByRole('button', { name: 'Publish' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Published.' })).toBeVisible()
    await expect(page).toHaveURL(/builder\?tracker=/)
    await expect(page.getByRole('heading', { level: 1, name: 'Edit Piano' })).toBeVisible()
    const minutes = (Date.now() - started) / 60_000
    expect(minutes).toBeLessThan(5)

    // Give it to Riley on People, from today.
    await page.goto('people')
    const riley = page
      .getByRole('region', { name: 'Students' })
      .getByRole('article', { name: /^Riley/ })
    const give = riley.getByRole('form', { name: 'Give Riley a tracker' })
    await give.getByLabel('Tracker').selectOption({ label: 'Piano' })
    await give.getByRole('button', { name: 'Assign' }).click()
    await expect(riley.getByRole('listitem').filter({ hasText: 'Piano' })).toBeVisible()

    const student = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const today = await student.newPage()
    await signIn(today, 'student2@example.test', PASSWORD)
    await expect(today.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
    const card = today.getByRole('region', { name: 'Piano' })
    await expect(card.getByText('Did you practice today?')).toBeVisible()
    await student.close()
  })

  test('editing the questions makes a second version', async ({ page }) => {
    await page.goto('builder')
    await page.getByRole('link', { name: 'Edit Piano' }).click()
    const first = page.getByRole('list', { name: 'Questions' }).getByRole('listitem').first()
    // A saved question keeps its kind of answer.
    await expect(first).toContainText('Its kind of answer stays')
    await first.getByLabel('The question').fill('Did you practice piano today?')
    await expect(page.getByText('this becomes version 2')).toBeVisible()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'version 2' })).toBeVisible()
  })
})
