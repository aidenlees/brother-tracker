import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { authFile } from './accounts'

/**
 * The book's pages and My week, against the fixtures: math session 5 (pp. 32–35) is
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

  test('Today shows every page small, in a row; the session page opens each full size', async ({
    page,
  }) => {
    await page.goto('today')
    const math = page.getByRole('region', { name: 'Singapore Math', exact: true })
    const thumbnails = math.getByRole('list', { name: 'Pages to work on' })
    await expect(thumbnails.getByRole('listitem')).toHaveCount(4)
    await loaded(thumbnails.getByRole('img', { name: 'Page 32 of the book' }))
    // All four sit side by side: one row, so the day's work shows at a glance.
    const boxes = await Promise.all(
      (await thumbnails.getByRole('listitem').all()).map((item) => item.boundingBox()),
    )
    expect(new Set(boxes.map((box) => Math.round(box?.y ?? -1))).size).toBe(1)

    await math.getByRole('link', { name: 'Pages 32–35', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Solve by Assuming' })).toBeVisible()
    await expect(page.getByText(/Pages 32–35$/)).toBeVisible()
    await expect(page.getByText('p. 32: #5, #6')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Log this session' })).toHaveAttribute(
      'href',
      /\/log\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/,
    )
    const pages = page.getByRole('list', { name: 'The pages' })
    await expect(pages.getByRole('img')).toHaveCount(4)
    await loaded(pages.getByRole('img', { name: 'Page 35 of the book' }))

    // A page opens in the viewer; Next and the arrow keys step through the rest.
    await pages.getByRole('button', { name: 'Open page 33' }).click()
    const viewer = page.getByRole('dialog', { name: /^Page 33 · 2 of 4$/ })
    await expect(viewer).toBeVisible()
    await loaded(viewer.getByRole('img', { name: 'Page 33 of the book' }))
    await expect(viewer.getByRole('link', { name: /Full size/ })).toHaveAttribute(
      'href',
      /\/storage\/v1\/object\/sign\/book-pages\/singapore-math\/033\.webp/,
    )
    await scan(page)
    await viewer.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('dialog', { name: /^Page 34 · 3 of 4$/ })).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('dialog', { name: /^Page 35 · 4 of 4$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await scan(page)
  })

  test('My week lists each day, and the weeks ahead show what is coming', async ({ page }) => {
    await page.goto('week')
    await expect(page.getByRole('heading', { level: 1, name: 'My week' })).toBeVisible()
    const today = page.locator('li[aria-current="date"]')
    await expect(today.getByText('Pages 32–35')).toBeVisible()
    await expect(today.getByText('To do').first()).toBeVisible()
    await scan(page)

    await page.getByRole('link', { name: 'Next week' }).click()
    await expect(page).toHaveURL(/\/week\?week=\d{4}-\d{2}-\d{2}$/)
    await expect(page.getByRole('link', { name: 'This week' })).toBeVisible()
    const coming = page.getByRole('link', { name: /^Pages \d+/ }).first()
    await coming.click()

    await expect(page.getByText(/^Planned for /)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Log it early' })).toBeVisible()
    await loaded(page.getByRole('list', { name: 'The pages' }).getByRole('img').first())
  })
})
