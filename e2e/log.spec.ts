import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { ACCOUNTS, authFile } from './accounts'
import { assignmentId, clearEntries, entriesOn, planItemId, todayNY } from './data'
import { signedInClient } from './supabase'

/**
 * The log flow, against the fixtures: math session 6 is today, session 1 (reading only)
 * is past and unlogged, session 5 was logged two days ago.
 */
test.describe('@log the math log flow', () => {
  test.use({ storageState: authFile('student') })
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async () => {
    await clearEntries(await signedInClient(ACCOUNTS.student.email), 'singapore-math', todayNY())
  })

  const step = (page: Page) => page.getByRole('heading', { level: 2 })
  const progress = (page: Page) => page.getByText(/^\d+ of \d+$/)

  async function open(page: Page) {
    await page.goto('today')
    await page.getByRole('link', { name: 'Log this session' }).click()
    await expect(page.getByRole('progressbar', { name: 'Progress' })).toBeVisible()
    await expect(step(page)).toContainText("Today's checklist")
  }

  test('a whole session, by keyboard alone', async ({ page }) => {
    await open(page)
    await expect(progress(page)).toHaveText('1 of 8')

    // Checklist: Space ticks, Tab moves, Enter goes on.
    await page.keyboard.press('Space')
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press('Tab')
      await page.keyboard.press('Space')
    }
    await page.keyboard.press('Enter')

    // Tallies: i h s u add one, Backspace takes back the last.
    await expect(step(page)).toContainText('How each problem went')
    await page.keyboard.type('iiihu')
    await page.keyboard.press('Backspace')
    await expect(page.getByText('4 problems')).toBeVisible()
    await page.keyboard.press('Enter')

    // One H: the retry step appears. Enter on its empty line moves on.
    await expect(step(page)).toContainText('Problems to retry')
    await expect(progress(page)).toHaveText('3 of 9')
    await page.keyboard.press('Enter')

    await expect(step(page)).toContainText('Minutes')
    await page.keyboard.type('45')
    await page.keyboard.press('Enter')

    await expect(step(page)).toContainText(/Key idea or error to watch/)
    await page.keyboard.type('assume they are all the same, then fix the difference')
    await page.keyboard.press('Enter')

    // "What I did" starts with the session's assignment; typing adds to it.
    await expect(step(page)).toContainText('What I did')
    await expect(page.getByRole('textbox')).toHaveValue('Practice pp. 31-32')
    await page.keyboard.type(', checked every answer')
    await page.keyboard.press('Enter')

    await expect(step(page)).toContainText('What I struggled with')
    await page.keyboard.type('p. 31 #4, the second part')
    await page.keyboard.press('Enter')

    await expect(step(page)).toContainText(/Reflection/)
    await expect(page.getByText('Why does that step work?')).toBeVisible() // session 6's prompt
    await page.keyboard.press('Enter')

    await expect(step(page)).toContainText(/Notebook photo/)
    await expect(progress(page)).toHaveText('9 of 9')
    await page.keyboard.press('Enter')

    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
    const math = page.getByRole('region', { name: 'Singapore Math' })
    await expect(math.getByText('· Synced')).toBeVisible()
    // With today's session saved, the card shows what comes next.
    const next = math.getByRole('region', { name: /^Next: / })
    await expect(next).toContainText('Session 7 · Solve by Assuming')
    await expect(next).toContainText('Practice pp. 33-34')

    const client = await signedInClient(ACCOUNTS.student.email)
    const [entry] = await entriesOn(client, 'singapore-math', todayNY())
    expect(entry?.plan_item_id).toBe(await planItemId(client, 'singapore-math', 6))
    expect(entry?.data).toEqual({
      checklist: { attempted: true, checked: true, explained: true, retry_planned: true },
      outcomes: { I: 3, H: 1, S: 0, U: 0 },
      minutes: 45,
      key_idea: 'assume they are all the same, then fix the difference',
      did: 'Practice pp. 31-32, checked every answer',
      struggled: 'p. 31 #4, the second part',
    })
  })

  test('a reading-only session skips the tallies', async ({ page }) => {
    const client = await signedInClient(ACCOUNTS.student.email)
    const math = await assignmentId(client, 'singapore-math')
    await page.goto(`log/${math}/${await planItemId(client, 'singapore-math', 1)}`)
    const answers: Record<string, string> = {
      Minutes: '20',
      'What I struggled with': 'which examples to read twice',
    }
    const seen: string[] = []
    for (let n = 1; n <= 7; n += 1) {
      await expect(progress(page)).toHaveText(`${n} of 7`)
      const label = (await step(page).innerText()).replace(/\s*optional$/, '')
      seen.push(label)
      const answer = answers[label]
      if (answer) await page.keyboard.type(answer)
      if (n < 7) await page.getByRole('button', { name: 'Next' }).click()
    }
    expect(seen).toEqual([
      "Today's checklist",
      'Minutes',
      'Key idea or error to watch',
      'What I did',
      'What I struggled with',
      'Reflection',
      'Notebook photo',
    ])
  })

  test('closing mid-way keeps the answers; Today offers to resume', async ({ page }) => {
    await open(page)
    await page.keyboard.press('Space')
    await page.keyboard.press('Enter')
    await page.keyboard.type('ii')
    await page.keyboard.press('Enter')
    await expect(step(page)).toContainText('Minutes')
    await page.keyboard.type('30')
    await page.waitForTimeout(500) // the draft is written 300 ms after a change

    await page.reload()
    await expect(step(page)).toContainText('Minutes')
    await expect(progress(page)).toHaveText('3 of 8')
    await expect(page.getByRole('textbox')).toHaveValue('30')
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByText('2 problems')).toBeVisible()

    await page.getByRole('link', { name: 'Back to Today' }).click()
    await expect(page.getByRole('link', { name: 'Resume logging' })).toBeVisible()
  })

  test('a required answer has to be given before going on', async ({ page }) => {
    await open(page)
    for (const label of ["Today's checklist", 'How each problem went']) {
      await expect(step(page)).toContainText(label)
      await page.keyboard.press('Enter')
    }
    await expect(step(page)).toContainText('Minutes')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('alert')).toHaveText('Minutes is required')
    await expect(step(page)).toContainText('Minutes')
  })

  test('an earlier session can be edited within its 7 days', async ({ page }) => {
    const client = await signedInClient(ACCOUNTS.student.email)
    const math = await assignmentId(client, 'singapore-math')
    const session5 = await planItemId(client, 'singapore-math', 5)
    await page.goto(`log/${math}/${session5}`)
    await expect(step(page)).toContainText("Today's checklist")
    while (!(await step(page).innerText()).startsWith('Minutes')) {
      await page.getByRole('button', { name: 'Next' }).click()
    }
    // The fixture logged 35 minutes; a re-run finds this test's last value instead.
    const box = page.getByRole('textbox', { name: 'Minutes' })
    await expect(box).toHaveValue(/^(35|40)$/)
    const minutes = (await box.inputValue()) === '40' ? 35 : 40
    await box.fill(String(minutes))
    for (;;) {
      const button = page.getByRole('button', { name: /^(Next|Save)$/ })
      const label = await button.innerText()
      await button.click()
      if (label.includes('Save')) break
    }

    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
    await expect
      .poll(async () => {
        const { data } = await client.from('entries').select('data').eq('plan_item_id', session5)
        return (data as { data: { minutes: number } }[]).map((e) => e.data.minutes)
      })
      .toEqual([minutes])
  })

  test('each step passes an accessibility scan', async ({ page }) => {
    await open(page)
    for (let i = 0; i < 3; i += 1) {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
      expect(results.violations).toEqual([])
      await page.getByRole('button', { name: 'Next' }).click()
      if (i === 1) await page.keyboard.type('20')
    }
  })
})
