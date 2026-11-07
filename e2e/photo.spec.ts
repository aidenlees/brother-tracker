import { expect, test } from '@playwright/test'
import { PASSWORD, signIn } from './accounts'
import { assignmentId, clearEntries, entriesOn, todayNY } from './data'
import { signedInClient } from './supabase'

/**
 * The photo field, end to end. No launch tracker has one, so the local fixtures give
 * student2 a "Notebook" tracker that does (scripts/e2e-fixtures.sql, never in the cloud).
 */
const STUDENT2 = 'student2@example.test'

/** A small PNG (a notebook page with a few ink lines), as if from a phone. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAAUklEQVR42u3WsQkAIAxE0WxiYeP+o9kErLKGCQ9ugQe/uHh5Wy8AAACGAtY+v01CAAAAAAAAAL6QhAAAAAAAAAB8IQkBAAAAAAAA+EISAgDoDygrYcE92cipGQAAAABJRU5ErkJggg==',
  'base64',
)

test.describe('@photo a photo field', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeEach(async () => {
    await clearEntries(await signedInClient(STUDENT2), 'e2e-notebook', todayNY())
  })

  test('added offline, it waits on the device, then uploads once with its entry', async ({
    page,
    context,
  }) => {
    const client = await signedInClient(STUDENT2)
    const notebook = await assignmentId(client, 'e2e-notebook')
    // From Today, as the student would: the dev server has no service worker, so a
    // screen not opened before going offline couldn't load (the installed app has it).
    await signIn(page, STUDENT2, PASSWORD)
    const card = page.getByRole('region', { name: 'Notebook', exact: true })
    await card.getByRole('link', { name: 'Log today' }).click()
    await expect(page.getByRole('progressbar', { name: 'Progress' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2 })).toContainText('Notebook photo')

    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Add a photo' }).click()
    await (await chooser).setFiles({ name: 'notebook.png', mimeType: 'image/png', buffer: PNG })
    await expect(page.getByRole('img', { name: 'Notebook photo, as added' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Replace photo' })).toBeVisible()

    await context.setOffline(true)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(card.getByText('· On this device, will sync')).toBeVisible()
    await expect(page.getByText('Saved on this device, will sync')).toBeVisible()
    expect(await entriesOn(client, 'e2e-notebook', todayNY())).toEqual([])

    await context.setOffline(false)
    await expect(card.getByText('· Synced')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Synced', { exact: true })).toBeVisible()

    const [entry] = await entriesOn(client, 'e2e-notebook', todayNY())
    const photo = (entry?.data as { notebook?: string } | undefined)?.notebook
    expect(photo).toMatch(/^[0-9a-f-]{36}$/)
    await expect
      .poll(async () => {
        const { data } = await client.from('attachments').select('id, storage_path')
        return (data as { id: string; storage_path: string }[]).filter((a) => a.id === photo)
      })
      .toHaveLength(1)
    const { data: user } = await client.auth.getUser()
    const { data: objects } = await client.storage
      .from('attachments')
      .list(`${user.user?.id ?? ''}/${entry?.id ?? ''}`)
    expect(objects?.map((o) => o.name)).toEqual([`${photo ?? ''}.jpg`])

    // Back in the entry, the photo now comes from storage through a short-lived link.
    await page.goto(`log/${notebook}?date=${todayNY()}`)
    await expect(page.getByRole('progressbar', { name: 'Progress' })).toBeVisible()
    await expect(page.getByRole('img', { name: 'Notebook photo, as added' })).toHaveAttribute(
      'src',
      /\/storage\/v1\/object\/sign\/attachments\//,
    )
  })
})
