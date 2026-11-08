import { expect, test, type Page } from '@playwright/test'
import { ACCOUNTS, authFile, PASSWORD, signIn } from './accounts'
import { addDays, clearEntries, entriesOn, todayNY } from './data'
import { signedInClient } from './supabase'

/**
 * Retries (followups), against the fixtures: the student has "p. 30 #2" due today;
 * student2 is on mixed-check session 13 with one retry overdue and one not due yet.
 */
const card = (page: Page, name: string) => page.getByRole('region', { name, exact: true })

async function followupStatus(email: string, label: string) {
  const client = await signedInClient(email)
  const { data, error } = await client.from('followups').select('status').eq('label', label)
  if (error) throw error
  return (data as { status: string }[]).map((f) => f.status)
}

test.describe('@followups retries', () => {
  test.describe.configure({ mode: 'serial' })

  test.describe('the student', () => {
    test.use({ storageState: authFile('student') })

    test('marks a due retry done, and can undo it', async ({ page }) => {
      await page.goto('today')
      const due = card(page, 'Singapore Math').getByRole('region', { name: 'Retries due' })
      await expect(due.getByText('p. 30 #2')).toBeVisible()
      await expect(due.getByText('due today')).toBeVisible()

      await due.getByRole('button', { name: 'Done: p. 30 #2' }).click()
      await expect(due.getByRole('button', { name: 'Undo: p. 30 #2' })).toBeVisible()
      await expect.poll(() => followupStatus(ACCOUNTS.student.email, 'p. 30 #2')).toEqual(['done'])

      await due.getByRole('button', { name: 'Undo: p. 30 #2' }).click()
      await expect(due.getByRole('button', { name: 'Done: p. 30 #2' })).toBeVisible()
      await expect.poll(() => followupStatus(ACCOUNTS.student.email, 'p. 30 #2')).toEqual(['open'])
    })

    test('a problem checked as a struggle becomes a retry; unchecked on an edit, it is dropped', async ({
      page,
    }) => {
      const client = await signedInClient(ACCOUNTS.student.email)
      await clearEntries(client, 'singapore-math', todayNY())
      const retries = async () => {
        const [entry] = await entriesOn(client, 'singapore-math', todayNY())
        if (!entry) return null
        const { data } = await client
          .from('followups')
          .select('label, due_date, status')
          .eq('entry_id', entry.id)
          .order('label')
        return data
      }
      const toggle = (label: string) =>
        page.locator('label', { has: page.getByRole('checkbox', { name: label }) }).click()

      await page.goto('today')
      await page.getByRole('link', { name: 'Log this session' }).click()
      await expect(page.getByRole('progressbar', { name: 'Progress' })).toBeVisible()
      await page.keyboard.press('y')
      await page.keyboard.press('Enter')
      await toggle('p. 32 #6')
      await toggle('p. 33 #7')
      await page.keyboard.press('Enter')
      await page.keyboard.type('30')
      await page.keyboard.press('Enter')
      await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()

      // The outbox sends the entry first, then its retries.
      const due = addDays(todayNY(), 2)
      await expect.poll(retries).toEqual([
        { label: 'p. 32 #6', due_date: due, status: 'open' },
        { label: 'p. 33 #7', due_date: due, status: 'open' },
      ])
      // Not due yet, so not on Today's list.
      await expect(page.getByText('p. 32 #6')).toHaveCount(0)

      // Edit: p. 33 #7 turned out fine after all.
      await card(page, 'Singapore Math').getByRole('link', { name: 'Edit' }).click()
      await page.getByRole('button', { name: 'Next' }).click()
      await expect(page.getByRole('checkbox', { name: 'p. 33 #7' })).toBeChecked()
      await toggle('p. 33 #7')
      await page.getByRole('button', { name: 'Next' }).click()
      await page.getByRole('button', { name: 'Save' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
      await expect.poll(retries).toEqual([
        { label: 'p. 32 #6', due_date: due, status: 'open' },
        { label: 'p. 33 #7', due_date: due, status: 'dropped' },
      ])
    })
  })

  test.describe('on a review day', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('every open retry is listed, oldest first', async ({ page }) => {
      await signIn(page, 'student2@example.test', PASSWORD)
      const list = card(page, 'Singapore Math').getByRole('region', {
        name: 'Every open retry, for today’s review',
      })
      await expect(list.getByRole('listitem')).toHaveText([
        /p\. 69 #11.*due yesterday/,
        /p\. 70 #13.*due tomorrow/,
      ])
    })
  })
})
