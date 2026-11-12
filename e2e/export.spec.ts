import { readFileSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { strFromU8, unzipSync } from 'fflate'
import { authFile } from './accounts'

/**
 * Export, against the fixtures: Riley logged math session 12 two days ago, struggling
 * with p. 69 #11 and p. 70 #13 (two retries); Sam logged session 4 and a violin day.
 */
test.describe('@export export', () => {
  test.use({ storageState: authFile('admin') })

  async function saved(page: Page, click: () => Promise<void>) {
    const [file] = await Promise.all([page.waitForEvent('download'), click()])
    const path = await file.path()
    return { name: file.suggestedFilename(), bytes: readFileSync(path) }
  }

  test('a workbook with a sheet per tracker, the retries and the comments', async ({ page }) => {
    await page.goto('export')
    await page.getByLabel('Student').selectOption({ label: 'Riley' })
    const tables = page.getByRole('list', { name: 'Tables' }).getByRole('listitem')
    await expect(tables.filter({ hasText: 'Singapore Math' })).toContainText('1 log')
    await expect(tables.filter({ hasText: 'Retries' })).toContainText('2')
    // Nothing to put in a CSV of no comments.
    await expect(
      tables.filter({ hasText: 'Comments' }).getByRole('button', { name: 'CSV of Comments' }),
    ).toBeDisabled()
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(results.violations).toEqual([])

    const book = await saved(page, () =>
      page.getByRole('button', { name: 'Download the workbook (.xlsx)' }).click(),
    )
    expect(book.name).toMatch(/^Riley practice \d{4}-\d{2}-\d{2}\.xlsx$/)
    const files = unzipSync(new Uint8Array(book.bytes))
    const text = (name: string) => strFromU8(files[name] ?? new Uint8Array())
    const workbook = text('xl/workbook.xml')
    for (const name of ['Singapore Math', 'Retries', 'Comments']) {
      expect(workbook).toContain(`name="${name}"`)
    }
    const sheets = Object.keys(files).filter((f) => f.startsWith('xl/worksheets/'))
    const all = sheets.map(text).join('')
    expect(all).toContain('p. 69 #11, p. 70 #13')
    expect(all).toContain('Session 12')
  })

  test('any one table as CSV', async ({ page }) => {
    await page.goto('export')
    await page.getByLabel('Student').selectOption({ label: 'Riley' })
    const csv = await saved(page, () =>
      page.getByRole('button', { name: 'CSV of Singapore Math' }).click(),
    )
    expect(csv.name).toMatch(/^Riley Singapore Math \d{4}-\d{2}-\d{2}\.csv$/)
    const [header, row] = csv.bytes
      .toString('utf8')
      .replace(/^\uFEFF/, '')
      .split('\r\n')
    expect(header).toMatch(/^Date,Planned for,Session,Pages,/)
    expect(row).toContain('"p. 69 #11, p. 70 #13"')

    const retries = await saved(page, () =>
      page.getByRole('button', { name: 'CSV of Retries' }).click(),
    )
    const lines = retries.bytes.toString('utf8').trim().split('\r\n')
    expect(lines[0]?.replace(/^\uFEFF/, '')).toBe('Tracker,Problem,From,Due,Status')
    expect(lines).toHaveLength(3)
  })

  test('each tracker a student has logged gets its own table', async ({ page }) => {
    await page.goto('export')
    await page.getByLabel('Student').selectOption({ label: 'Sam' })
    const tables = page.getByRole('list', { name: 'Tables' }).getByRole('listitem')
    await expect(tables.filter({ hasText: 'Singapore Math' })).toBeVisible()
    await expect(tables.filter({ hasText: 'Violin' })).toBeVisible()
  })
})
