import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { authFile } from './accounts'

/**
 * The book's pages and My week, against the fixtures: math session 6 (pp. 31–32) is
 * today. Locally the pages are the real book's if `pnpm book:pages` has run, else the
 * fixtures' placeholder; either way each is an image from the private bucket.
 */
test.describe('@pages the book’s pages and My week', () => {
  test.use({ storageState: authFile('student') })

  const loaded = (image: Locator) =>
    expect
      .poll(() => image.evaluate((el) => (el as unknown as { naturalWidth: number }).naturalWidth))
      .toBeGreaterThan(0)

  async function scan(page: Page) {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(results.violations).toEqual([])
  }

  test('Today shows today’s pages; the session page shows each one large', async ({ page }) => {
    await page.goto('today')
    const math = page.getByRole('region', { name: 'Singapore Math', exact: true })
    const thumbnails = math.getByRole('list', { name: 'Pages to work on' })
    await expect(thumbnails.getByRole('listitem')).toHaveCount(2)
    await loaded(thumbnails.getByRole('img', { name: 'Page 31 of the book' }))

    await math.getByRole('link', { name: 'Pages 31–32', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Solve by Assuming' })).toBeVisible()
    await expect(page.getByText(/Pages 31–32$/)).toBeVisible()
    await expect(page.getByText('p. 31: #3, #4')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Log this session' })).toHaveAttribute(
      'href',
      /\/log\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/,
    )
    const pages = page.getByRole('list', { name: 'The pages' })
    await expect(pages.getByRole('img')).toHaveCount(2)
    await loaded(pages.getByRole('img', { name: 'Page 32 of the book' }))
    await expect(pages.getByRole('link', { name: /Full size/ }).first()).toHaveAttribute(
      'href',
      /\/storage\/v1\/object\/sign\/book-pages\/singapore-math\/031\.webp/,
    )
    await scan(page)
  })

  test('My week lists each day, and the weeks ahead show what is coming', async ({ page }) => {
    await page.goto('week')
    await expect(page.getByRole('heading', { level: 1, name: 'My week' })).toBeVisible()
    const today = page.locator('li[aria-current="date"]')
    await expect(today.getByText('Pages 31–32')).toBeVisible()
    await expect(today.getByText('To do').first()).toBeVisible()
    await scan(page)

    await page.getByRole('link', { name: 'Next week' }).click()
    await expect(page).toHaveURL(/\/week\?week=\d{4}-\d{2}-\d{2}$/)
    await expect(page.getByRole('link', { name: 'This week' })).toBeVisible()
    const coming = page.getByRole('link', { name: /^Pages \d+/ }).first()
    await coming.click()

    await expect(page.getByText(/^Planned for /)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Done it early? Log it' })).toBeVisible()
    await loaded(page.getByRole('list', { name: 'The pages' }).getByRole('img').first())
  })
})
