import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { ACCOUNTS, authFile } from './accounts'
import { addDays, longDay, resetTasks, todayNY } from './data'
import { signedInClient } from './supabase'

/**
 * Tasks, end to end: the admin adds them on the Tasks screen, Sam ticks them off on
 * Today. Each test starts with no student holding the task tracker, so the first task
 * assigns it, and leaves it that way for the other specs.
 */

async function scan(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(results.violations).toEqual([])
}

async function asRole(browser: Browser, role: 'admin' | 'student', path: string) {
  const context = await browser.newContext({ storageState: authFile(role) })
  const page = await context.newPage()
  await page.goto(path)
  return { context, page }
}

/** Fills in the Add a task form for Sam and submits it. */
async function addTask(
  page: Page,
  title: string,
  fill?: (form: ReturnType<Page['getByRole']>) => Promise<void>,
) {
  const form = page.getByRole('form', { name: 'Add a task' })
  // Riley comes first by name; these tasks are for Sam.
  const riley = form.getByRole('checkbox', { name: 'Riley' })
  if (await riley.isChecked()) await form.getByText('Riley', { exact: true }).click()
  const sam = form.getByRole('checkbox', { name: 'Sam' })
  if (!(await sam.isChecked())) await form.getByText('Sam', { exact: true }).click()
  await form.getByLabel('Task').fill(title)
  if (fill) await fill(form)
  await form.getByRole('button', { name: 'Add task' }).click()
  return form
}

const studentTasks = async () => {
  const client = await signedInClient(ACCOUNTS.student.email)
  const { data, error } = await client
    .from('entries')
    .select('data, date, assignments!inner(trackers!inner(display))')
    .eq('assignments.trackers.display', 'task_list')
  if (error) throw error
  return (data as { data: unknown; date: string }[]).map((e) => ({ data: e.data, date: e.date }))
}

test.describe('@tasks tasks the admin adds', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeEach(resetTasks)
  test.afterAll(resetTasks)

  test('the admin adds a task; the student ticks it off on Today, offline too', async ({
    browser,
  }) => {
    const admin = await asRole(browser, 'admin', 'tasks')
    await expect(admin.page.getByRole('heading', { level: 1, name: 'Tasks' })).toBeVisible()
    const form = await addTask(admin.page, 'Read chapter 3', async (f) => {
      await f.getByLabel('Notes (optional)').fill('Bring the book to dinner.')
    })
    await expect(form.getByRole('status')).toHaveText(
      `Added “Read chapter 3” for Sam on ${longDay(todayNY())}.`,
    )
    await admin.page.getByLabel('Student').selectOption({ label: 'Sam' })
    const todays = admin.page.getByRole('region', { name: longDay(todayNY()), exact: true })
    await expect(todays.getByText('Read chapter 3')).toBeVisible()
    await expect(todays.getByText('To do')).toBeVisible()
    await scan(admin.page)

    // Sam's Today: a Tasks card, and the box ticks off even with no connection.
    const student = await asRole(browser, 'student', 'today')
    const tasks = student.page.getByRole('region', { name: 'Tasks', exact: true })
    const box = tasks.getByRole('checkbox', { name: 'Read chapter 3' })
    await expect(box).not.toBeChecked()
    await expect(tasks.getByText('Bring the book to dinner.')).toBeVisible()
    await scan(student.page)
    await student.context.setOffline(true)
    await tasks.getByText('Read chapter 3').click()
    await expect(box).toBeChecked()
    await expect(student.page.getByText('Saved on this device, will sync')).toBeVisible()
    await student.context.setOffline(false)
    await expect(student.page.getByText('Synced', { exact: true })).toBeVisible({ timeout: 20_000 })
    await expect.poll(studentTasks).toEqual([{ data: { done: true }, date: todayNY() }])

    // The admin sees it done.
    await admin.page.reload()
    await admin.page.getByLabel('Student').selectOption({ label: 'Sam' })
    await expect(
      admin.page
        .getByRole('region', { name: longDay(todayNY()), exact: true })
        .getByText(`Done ${longDay(todayNY())}`),
    ).toBeVisible()

    // My week lists it with its note; a task has no session page to open.
    await student.page.goto('week')
    const day = student.page.locator('li[aria-current="date"]')
    await expect(day.getByText('Read chapter 3')).toBeVisible()
    await expect(day.getByText('Tasks · Bring the book to dinner.')).toBeVisible()
    await expect(day.getByRole('link', { name: /Read chapter 3/ })).toHaveCount(0)

    // Unticking it clears that log.
    await student.page.goto('today')
    await tasks.getByText('Read chapter 3').click()
    await expect(box).not.toBeChecked()
    await expect.poll(studentTasks).toEqual([])
    await admin.context.close()
    await student.context.close()
  })

  test('a repeating task makes one a day; the rest of the series can be deleted', async ({
    browser,
  }) => {
    const admin = await asRole(browser, 'admin', 'tasks')
    const form = await addTask(admin.page, 'Scales, 10 minutes', async (f) => {
      await f.getByLabel('Repeat').selectOption({ label: 'Every day' })
      await f.getByLabel('Last day').fill(addDays(todayNY(), 2))
      await expect(
        f.getByText(`3 tasks, ${longDay(todayNY())} to ${longDay(addDays(todayNY(), 2))}.`),
      ).toBeVisible()
    })
    await expect(form.getByRole('status')).toContainText('3 days')
    await admin.page.getByLabel('Student').selectOption({ label: 'Sam' })
    for (const offset of [0, 1, 2]) {
      const day = admin.page.getByRole('region', {
        name: longDay(addDays(todayNY(), offset)),
        exact: true,
      })
      await expect(day.getByText('Repeats')).toBeVisible()
    }

    const tomorrow = longDay(addDays(todayNY(), 1))
    await admin.page.getByRole('button', { name: `Delete Scales, 10 minutes, ${tomorrow}` }).click()
    const ask = admin.page.getByRole('group', { name: 'Delete “Scales, 10 minutes”?' })
    await expect(ask.getByRole('button', { name: 'Keep it' })).toBeFocused()
    await ask.getByRole('button', { name: 'Delete it and the 1 after it' }).click()
    await expect(admin.page.getByRole('status').filter({ hasText: '(2 days)' })).toBeVisible()
    await expect(admin.page.getByRole('region', { name: tomorrow, exact: true })).toHaveCount(0)
    await expect(
      admin.page
        .getByRole('region', { name: longDay(todayNY()), exact: true })
        .getByText('Scales, 10 minutes'),
    ).toBeVisible()

    // Tasks have their own screen, so the plan editor leaves them out.
    await admin.page.goto('plan')
    await expect(admin.page.getByRole('option', { name: 'Sam · Tasks' })).toHaveCount(0)
    await admin.context.close()
  })

  test('an earlier task stays until it’s done; deleting a done task clears its log', async ({
    browser,
  }) => {
    const yesterday = addDays(todayNY(), -1)
    const admin = await asRole(browser, 'admin', 'tasks')
    await addTask(admin.page, 'Redo p. 31 #4 with me', async (f) => {
      await f.getByLabel('Day', { exact: true }).fill(yesterday)
    })
    await expect(admin.page.getByRole('status').filter({ hasText: 'Added “Redo' })).toBeVisible()

    const student = await asRole(browser, 'student', 'today')
    const tasks = student.page.getByRole('region', { name: 'Tasks', exact: true })
    await expect(tasks.getByText('No tasks today.')).toBeVisible()
    const still = tasks.getByRole('list', { name: 'Still to do' })
    await expect(still.getByText(`From ${longDay(yesterday)}`)).toBeVisible()
    await still.getByText('Redo p. 31 #4 with me').click()
    await expect(still.getByRole('checkbox', { name: 'Redo p. 31 #4 with me' })).toBeChecked()
    await expect.poll(studentTasks).toEqual([{ data: { done: true }, date: todayNY() }])

    await admin.page.reload()
    await admin.page.getByLabel('Student').selectOption({ label: 'Sam' })
    await admin.page.getByText('Earlier (1)').click()
    await expect(admin.page.getByText(`Done ${longDay(todayNY())}`)).toBeVisible()
    await admin.page
      .getByRole('button', { name: `Delete Redo p. 31 #4 with me, ${longDay(yesterday)}` })
      .click()
    const ask = admin.page.getByRole('group', { name: 'Delete “Redo p. 31 #4 with me”?' })
    await expect(ask).toContainText('It’s done: deleting it also clears that log.')
    await ask.getByRole('button', { name: 'Delete it', exact: true }).click()
    await expect(
      admin.page.getByRole('status').filter({ hasText: 'Deleted “Redo p. 31 #4 with me”.' }),
    ).toBeVisible()
    await expect.poll(studentTasks).toEqual([])

    // With nothing to do or coming, Sam's Today has no Tasks card. (A fresh session: the
    // open one keeps its copy for up to 30 seconds, as Today does offline.)
    await student.context.close()
    const later = await asRole(browser, 'student', 'today')
    await expect(later.page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
    await expect(later.page.getByRole('region', { name: 'Singapore Math' })).toBeVisible()
    await expect(later.page.getByRole('region', { name: 'Tasks', exact: true })).toHaveCount(0)
    await admin.context.close()
    await later.context.close()
  })
})
