import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { authFile } from './accounts'
import { addDays, shortDay, todayNY } from './data'

/**
 * The Retry queue, against the fixtures: Sam's p. 30 #2 (from session 4, yesterday) is
 * due today; Riley's p. 69 #11 was due yesterday and p. 70 #13 is due tomorrow (from
 * session 12, two days ago), and Riley's session 13 today is the first mixed check,
 * which lists every open retry.
 */
test.describe('@retries retry queue', () => {
  async function scan(page: Page) {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(results.violations).toEqual([])
  }

  test.describe('the admin', () => {
    test.use({ storageState: authFile('admin') })

    test('reads a student’s open retries, overdue first', async ({ page }) => {
      await page.goto('retries')
      await page.getByLabel('Student').selectOption({ label: 'Riley' })
      const math = page.getByRole('region', { name: 'Singapore Math' })
      await expect(math.getByRole('heading', { level: 3 })).toHaveText(['Overdue', 'Coming up'])
      const overdue = math.getByRole('region', { name: 'Overdue' }).getByRole('listitem')
      await expect(overdue).toHaveCount(1)
      await expect(overdue).toContainText('p. 69 #11')
      await expect(overdue).toContainText('due yesterday')
      const coming = math.getByRole('region', { name: 'Coming up' }).getByRole('listitem')
      await expect(coming).toHaveCount(1)
      await expect(coming).toContainText('p. 70 #13')
      await expect(coming).toContainText('due tomorrow')
      await expect(
        math.getByText(
          'Every open retry comes up again today, in Session 13 · Review: Chapters 1–5.',
        ),
      ).toBeVisible()
      // Read only: nothing here marks a retry done.
      await expect(math.getByRole('button')).toHaveCount(0)
      await scan(page)
    })

    test('opens a retry’s log on Struggles', async ({ page }) => {
      await page.goto('retries')
      await page.getByLabel('Student').selectOption({ label: 'Sam' })
      const math = page.getByRole('region', { name: 'Singapore Math' })
      const today = math.getByRole('region', { name: 'Due today' }).getByRole('listitem')
      await expect(today).toContainText('p. 30 #2')
      await expect(today).not.toContainText('due today')
      await expect(
        math.getByText(
          /^Every open retry comes up again on \w+, \w+ \d+, in Session 13 · Review: Chapters 1–5\.$/,
        ),
      ).toBeVisible()
      await scan(page)

      const yesterday = shortDay(addDays(todayNY(), -1))
      await today
        .getByRole('link', { name: new RegExp(`^Session 4 · .+ · ${yesterday} on Struggles$`) })
        .click()
      await expect(page).toHaveURL(/\/struggles\?student=[^#]+#entry-/)
      await expect(page.getByRole('article', { name: /^Session 4/ })).toBeInViewport()
      await expect(page.getByLabel('Student').locator('option:checked')).toHaveText('Sam')
    })
  })

  test.describe('a viewer', () => {
    test.use({ storageState: authFile('viewer') })

    test('is sent back to Overview', async ({ page }) => {
      await page.goto('retries')
      await expect(page).toHaveURL(/\/overview$/)
    })
  })
})
