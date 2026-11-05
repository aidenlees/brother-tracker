import { expect, test, type Page } from '@playwright/test'
import { ACCOUNTS, authFile, PASSWORD, signIn } from './accounts'
import { addDays, clearEntries, entriesOn, todayNY } from './data'
import { signedInClient } from './supabase'

/**
 * Retries (followups), against the fixtures: the student has "p. 30 #2" due today;
 * student2 is on review session 21 with one retry overdue and one not due yet.
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

    test('adds retries in the log flow, one per line, due in two days', async ({ page }) => {
      const client = await signedInClient(ACCOUNTS.student.email)
      await clearEntries(client, 'singapore-math', todayNY())
      await page.goto('today')
      await page.getByRole('link', { name: 'Log this session' }).click()
      await expect(page.getByRole('progressbar', { name: 'Progress' })).toBeVisible()

      await page.keyboard.press('Enter') // checklist as it is
      await page.keyboard.type('iihu')
      await page.keyboard.press('Enter')
      await expect(page.getByRole('heading', { level: 2 })).toContainText('Problems to retry')
      await expect(page.getByText('2 problems needed help.')).toBeVisible()
      await page.keyboard.type('p. 31 #4')
      await page.keyboard.press('Enter')
      await page.keyboard.type('p. 32 #1')
      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter') // empty line: move on
      await expect(page.getByRole('heading', { level: 2 })).toContainText('Minutes')
      await page.keyboard.type('30')
      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter') // key idea: skip
      await page.keyboard.press('Enter') // what I did: as filled in
      await page.keyboard.type('the second retry')
      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter') // reflection: skip
      await page.keyboard.press('Enter') // photo: skip, save
      await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()

      // The outbox sends the entry first, then its retries.
      await expect
        .poll(async () => {
          const [entry] = await entriesOn(client, 'singapore-math', todayNY())
          if (!entry) return null
          const { data } = await client
            .from('followups')
            .select('label, due_date, status')
            .eq('entry_id', entry.id)
            .order('label')
          return data
        })
        .toEqual([
          { label: 'p. 31 #4', due_date: addDays(todayNY(), 2), status: 'open' },
          { label: 'p. 32 #1', due_date: addDays(todayNY(), 2), status: 'open' },
        ])
      // Not due yet, so not on Today's list.
      await expect(page.getByText('p. 31 #4')).toHaveCount(0)
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
        /p\. 70 #3.*due tomorrow/,
      ])
    })
  })
})
