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

/**
 * Overview's weekly numbers, against Riley's fixtures, which no other spec changes: math
 * session 12 logged two days ago (completed, 2 problems struggled with, 40 minutes),
 * sessions 1 to 11 never logged, session 13 today. Sam's violin practice 8 days ago
 * gives a focus note.
 */
test.describe('@overview weekly numbers', () => {
  const weekOf = (iso: string) => addDays(iso, -new Date(`${iso}T00:00:00Z`).getUTCDay())
  const week = (page: Page) => page.getByRole('region', { name: /^(This week · |Week of )/ })

  async function scan(page: Page) {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(results.violations).toEqual([])
  }

  test('the admin sees a week’s numbers beside the week before, and the pacing flags', async ({
    browser,
  }) => {
    // Session 12's share solved on my own, worked out by hand from its problem list.
    const riley = await signedInClient('student2@example.test')
    const { data: item, error } = await riley
      .from('plan_items')
      .select('details')
      .eq('id', await planItemId(riley, 'singapore-math', 12))
      .single()
    if (error) throw error
    const problems = (item.details as { problems: string[] }).problems.length
    const share = `${String(Math.round(((problems - 2) / problems) * 100))}%`

    const admin = await browser.newContext({ storageState: authFile('admin') })
    const page = await admin.newPage()
    const sunday = weekOf(addDays(todayNY(), -2))
    await page.goto(sunday === weekOf(todayNY()) ? 'overview' : `overview?week=${sunday}`)
    await page.getByLabel('Student').selectOption({ label: 'Riley' })

    const math = week(page).getByRole('article', { name: 'Singapore Math' })
    await expect(math.getByRole('term')).toHaveText([
      'Sessions completed',
      'Minutes',
      'Solved on my own',
    ])
    // This week's number, then last week's, when nothing was logged.
    await expect(math.getByRole('definition')).toHaveText([
      '1Last week –nothing logged',
      '40 minLast week –nothing logged',
      `${share}Last week –nothing logged`,
    ])
    const flags = math.getByRole('list', { name: 'Pacing flags' })
    await expect(flags.getByRole('listitem')).toHaveText([
      /^Behind plan\. 11 sessions not logged, from \w{3} \d+ to \w{3} \d+\.$/,
    ])
    // A tracker with no numbers (Riley's photo notebook) has no card.
    await expect(week(page).getByRole('article', { name: 'Notebook' })).toHaveCount(0)
    await scan(page)

    // The week before: blank, never 0.
    await week(page).getByRole('link', { name: 'Previous week' }).click()
    await expect(week(page).getByRole('heading', { level: 2 })).toHaveText(/^Week of /)
    await expect(
      week(page).getByRole('article', { name: 'Singapore Math' }).getByRole('definition').first(),
    ).toHaveText('–Nothing loggedLast week –nothing logged')
    // Riley's violin starts in 3 days: no numbers before it does.
    await expect(week(page).getByRole('article', { name: 'Violin' })).toContainText(
      `Starts ${longDay(addDays(todayNY(), 3))}.`,
    )
    await week(page).getByRole('link', { name: 'This week' }).click()
    await expect(week(page).getByRole('heading', { level: 2 })).toHaveText(/^This week · /)
    await admin.close()
  })

  test('a viewer sees the numbers and notes, never a pacing flag', async ({ browser }) => {
    const viewer = await browser.newContext({ storageState: authFile('viewer') })
    const page = await viewer.newPage()
    const practiced = addDays(todayNY(), -8)
    await page.goto(`overview?week=${weekOf(practiced)}`)

    const violin = week(page).getByRole('article', { name: 'Violin' })
    await expect(violin.getByRole('term')).toHaveText(['Practice days', 'Streak'])
    const notes = violin.getByRole('list').filter({ hasText: 'long, even bows on the A string' })
    await expect(notes.getByRole('listitem').first()).toBeVisible()
    await expect(violin.getByText('One specific thing you focused on')).toBeVisible()
    // Sam's math has sessions not logged, but flags are the admin's alone.
    await expect(week(page).getByRole('article', { name: 'Singapore Math' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Pacing flags' })).toHaveCount(0)
    await expect(page.getByText(/Behind plan|Slow down|trimming repetition/)).toHaveCount(0)
    await scan(page)
    await viewer.close()
  })
})
