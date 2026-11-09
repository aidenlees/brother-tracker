import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { ACCOUNTS, authFile } from './accounts'
import {
  addDays,
  assignmentId,
  clearEntries,
  entriesOn,
  fieldVersion,
  longDay,
  planItemId,
  todayNY,
} from './data'
import { signedInClient } from './supabase'

/**
 * Overview's recent logs, against the fixtures: Sam logged math session 4 yesterday
 * (p. 30 #2 a struggle; other specs edit its minutes) and violin 8 days ago; Riley logged session 12 two days ago.
 * Jordan (viewer) is linked to Sam only. Tests that clear make their own log first, so
 * the fixtures stay as they are.
 */
test.describe('@overview recent logs', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async () => {
    await clearEntries(await signedInClient(ACCOUNTS.student.email), 'singapore-math', todayNY())
  })

  const day = (page: Page, iso: string) =>
    page.getByRole('region', { name: longDay(iso), exact: true })

  async function scan(page: Page) {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(results.violations).toEqual([])
  }

  test('the admin sees each student’s logs, with every answer', async ({ browser }) => {
    const admin = await browser.newContext({ storageState: authFile('admin') })
    const page = await admin.newPage()
    await page.goto('overview')
    await page.getByLabel('Student').selectOption({ label: 'Sam' })

    const math = day(page, addDays(todayNY(), -1)).getByRole('article', { name: 'Singapore Math' })
    await expect(math.getByText(/^Session 4 · .+ · Pages \d+–\d+$/)).toBeVisible()
    await expect(math.getByText('p. 30 #2', { exact: true })).toBeVisible()
    await expect(math.getByText(/^\d+ min$/)).toBeVisible()
    // Past the student's 7 days, a log can still be cleared by the admin.
    const violin = day(page, addDays(todayNY(), -8)).getByRole('article', { name: 'Violin' })
    await expect(violin.getByText('long, even bows on the A string')).toBeVisible()
    await expect(violin.getByRole('button', { name: 'Clear this log' })).toBeVisible()
    await scan(page)

    await page.getByLabel('Student').selectOption({ label: 'Riley' })
    const riley = day(page, addDays(todayNY(), -2)).getByRole('article', { name: 'Singapore Math' })
    await expect(riley.getByText('p. 69 #11, p. 70 #13', { exact: true })).toBeVisible()
    await admin.close()
  })

  test('the admin clears a log made by mistake: gone, with its retry, for the student too', async ({
    browser,
  }) => {
    // Sam logs today's session, with one struggle.
    const student = await signedInClient(ACCOUNTS.student.email)
    const { data: entry, error } = await student
      .from('entries')
      .insert({
        assignment_id: await assignmentId(student, 'singapore-math'),
        plan_item_id: await planItemId(student, 'singapore-math', 5),
        field_version: await fieldVersion(student, 'singapore-math'),
        date: todayNY(),
        data: { completed: true, struggled: ['p. 32 #5'], minutes: 20 },
      })
      .select('id')
      .single()
    if (error) throw error
    const { error: retryError } = await student.from('followups').insert({
      entry_id: entry.id,
      assignment_id: await assignmentId(student, 'singapore-math'),
      label: 'p. 32 #5',
      due_date: addDays(todayNY(), 2),
    })
    if (retryError) throw retryError

    const admin = await browser.newContext({ storageState: authFile('admin') })
    const page = await admin.newPage()
    await page.goto('overview')
    await page.getByLabel('Student').selectOption({ label: 'Sam' })
    const log = day(page, todayNY()).getByRole('article', { name: 'Singapore Math' })
    await expect(log.getByText('p. 32 #5', { exact: true })).toBeVisible()

    await log.getByRole('button', { name: 'Clear this log' }).click()
    const ask = log.getByRole('group', { name: /^Clear this log\?/ })
    await expect(ask).toHaveAccessibleName(
      'Clear this log? It’s removed for good, with its 1 retry. The student sees it gone; the audit log keeps a copy.',
    )
    // "Keep it" has the focus, so Enter never clears by accident.
    await expect(ask.getByRole('button', { name: 'Keep it' })).toBeFocused()
    await scan(page)
    await ask.getByRole('button', { name: 'Clear it' }).click()

    await expect(
      page
        .getByRole('status')
        .filter({ hasText: `Cleared Sam’s Singapore Math log for ${longDay(todayNY())}.` }),
    ).toBeVisible()
    // (Other specs may leave a violin check-in today; only this log goes.)
    await expect(log).toHaveCount(0)
    await admin.close()

    expect(await entriesOn(student, 'singapore-math', todayNY())).toEqual([])
    const { data: retries } = await student.from('followups').select('id').eq('entry_id', entry.id)
    expect(retries).toEqual([])
  })

  test('a viewer sees the linked student’s logs, but can’t clear one', async ({ browser }) => {
    const viewer = await browser.newContext({ storageState: authFile('viewer') })
    const page = await viewer.newPage()
    await page.goto('overview')
    // Only Sam is linked: no picker, and Riley never shows.
    await expect(page.getByLabel('Student')).toHaveCount(0)
    await expect(page.getByText('Sam', { exact: true })).toBeVisible()
    const math = day(page, addDays(todayNY(), -1)).getByRole('article', { name: 'Singapore Math' })
    await expect(math.getByText('p. 30 #2', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Clear this/ })).toHaveCount(0)
    await expect(page.getByText('p. 69 #11', { exact: false })).toHaveCount(0)
    await scan(page)
    await viewer.close()
  })
})
