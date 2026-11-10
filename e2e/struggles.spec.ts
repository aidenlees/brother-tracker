import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { ACCOUNTS, authFile } from './accounts'
import { addDays, clearComments, shortDay, todayNY } from './data'
import { signedInClient } from './supabase'

/**
 * Struggles and comments, against the fixtures: Sam (linked to Jordan, the viewer)
 * logged math session 4 yesterday with p. 30 #2 a struggle, its retry due today; Riley
 * logged session 12 two days ago with p. 69 #11 (retry overdue since yesterday) and
 * p. 70 #13 (due tomorrow). The fixtures have no comments; each test starts with none.
 */
test.describe('@struggles struggles and comments', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeEach(clearComments)
  test.afterAll(clearComments)

  async function scan(page: Page) {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(results.violations).toEqual([])
  }

  test('the admin reads each struggle with its retry, and comments, edits and deletes', async ({
    browser,
  }) => {
    const admin = await browser.newContext({ storageState: authFile('admin') })
    const page = await admin.newPage()
    await page.goto('struggles')
    await page.getByLabel('Student').selectOption({ label: 'Riley' })

    const card = page.getByRole('article', { name: /^Session 12/ })
    await expect(card.getByText(/^Pages? [\d–]+ · \w+day, \w+ \d+$/)).toBeVisible()
    const problems = card.getByRole('listitem')
    await expect(problems.filter({ hasText: 'p. 69 #11' })).toContainText(
      `Retry overdue since ${shortDay(addDays(todayNY(), -1))}`,
    )
    await expect(problems.filter({ hasText: 'p. 70 #13' })).toContainText('Retry due tomorrow')
    await scan(page)

    // A comment: posted, then it reads as yours.
    const thread = card.getByRole('group', { name: 'Comments' })
    const box = thread.getByRole('textbox', { name: 'Add a comment' })
    await expect(thread.getByRole('button', { name: 'Post' })).toBeDisabled()
    await box.fill('Draw the bar model before you divide.')
    await thread.getByRole('button', { name: 'Post' }).click()
    const mine = thread.getByRole('listitem').filter({ hasText: 'Draw the bar model' })
    await expect(mine).toContainText('You')
    await expect(box).toHaveValue('')

    // Edited: the new words, marked as edited.
    await mine.getByRole('button', { name: 'Edit your comment' }).click()
    const edit = mine.getByRole('textbox', { name: 'Edit your comment' })
    await expect(edit).toBeFocused()
    await edit.fill('Draw the bar model first, then divide.')
    await mine.getByRole('button', { name: 'Save' }).click()
    const edited = thread.getByRole('listitem').filter({ hasText: 'then divide' })
    await expect(edited).toContainText('edited')
    await scan(page)

    // "Retry still open" keeps this session: one of its retries is open.
    await page.getByRole('button', { name: 'Retry still open' }).click()
    await expect(page).toHaveURL(/show=open/)
    await expect(card).toBeVisible()

    // Deleted after a confirm, with "Keep it" focused so Enter never deletes by accident.
    await edited.getByRole('button', { name: 'Delete your comment' }).click()
    await expect(edited.getByRole('button', { name: 'Keep it' })).toBeFocused()
    await edited.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(thread.getByRole('listitem')).toHaveCount(0)
    await admin.close()
  })

  test('a viewer comments on the linked student’s struggle; the student replies from Today', async ({
    browser,
  }) => {
    const viewer = await browser.newContext({ storageState: authFile('viewer') })
    const page = await viewer.newPage()
    await page.goto('struggles')
    // Only the linked student: no menu to pick another.
    await expect(page.getByLabel('Student')).toHaveCount(0)
    await expect(page.getByText(ACCOUNTS.student.name, { exact: true })).toBeVisible()
    const card = page.getByRole('article', { name: /^Session 4/ })
    await expect(card.getByText('p. 30 #2', { exact: true })).toBeVisible()
    const thread = card.getByRole('group', { name: 'Comments' })
    await thread.getByRole('textbox', { name: 'Add a comment' }).fill('You stuck with this one.')
    await thread.getByRole('button', { name: 'Post' }).click()
    await expect(thread.getByRole('listitem')).toContainText('You stuck with this one.')

    const student = await browser.newContext({ storageState: authFile('student') })
    const today = await student.newPage()
    await today.goto('today')
    const math = today.getByRole('region', { name: 'Singapore Math' })
    const line = math
      .getByRole('region', { name: 'Comments' })
      .getByRole('link', { name: /^Jordan commented on Session 4/ })
    await expect(line).toBeVisible()
    await scan(today)
    await line.click()

    // The session's page: the conversation, by name, and a reply.
    const conversation = today.getByRole('group', { name: 'Comments' })
    await expect(conversation.getByRole('listitem')).toContainText(['Jordan'])
    await expect(conversation).toContainText('You stuck with this one.')
    await conversation.getByRole('textbox', { name: 'Reply' }).fill('Thanks. I redid it twice.')
    await conversation.getByRole('button', { name: 'Post' }).click()
    await expect(conversation.getByRole('listitem').nth(1)).toContainText('You')
    await scan(today)

    // Jordan sees the reply under Sam's name.
    await page.reload()
    const reply = card.getByRole('listitem').filter({ hasText: 'I redid it twice' })
    await expect(reply).toContainText(ACCOUNTS.student.name)
    await expect(reply.getByRole('button', { name: 'Edit your comment' })).toHaveCount(0)
    await viewer.close()
    await student.close()
  })

  test('the database refuses a viewer’s comment on an unlinked student', async () => {
    const riley = await signedInClient('student2@example.test')
    const { data } = await riley.from('entries').select('id').limit(1)
    const entryId: unknown = data?.[0]?.id
    expect(typeof entryId).toBe('string')
    const jordan = await signedInClient(ACCOUNTS.viewer.email)
    const { error } = await jordan.from('comments').insert({ entry_id: entryId, body: 'Hi' })
    expect(error?.code).toBe('42501')
  })

  test('an Overview log links to its struggle', async ({ browser }) => {
    const admin = await browser.newContext({ storageState: authFile('admin') })
    const page = await admin.newPage()
    await page.goto('overview')
    await page.getByLabel('Student').selectOption({ label: 'Riley' })
    await page
      .getByRole('region', { name: 'Recent logs' })
      .getByRole('link', { name: 'Add a comment on Struggles' })
      .first()
      .click()
    await expect(page).toHaveURL(/\/struggles\?student=[^#]+#entry-/)
    await expect(page.getByRole('article', { name: /^Session 12/ })).toBeInViewport()
    await expect(page.getByLabel('Student').locator('option:checked')).toHaveText('Riley')
    await admin.close()
  })
})
