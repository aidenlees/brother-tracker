import { expect, test, type Page } from '@playwright/test'
import { ACCOUNTS, authFile } from './accounts'
import { assignmentId, clearEntries, entriesOn, planItemId, todayNY } from './data'
import { signedInClient } from './supabase'

/** A small PNG (a notebook page with a few ink lines), as if from a phone. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAAUklEQVR42u3WsQkAIAxE0WxiYeP+o9kErLKGCQ9ugQe/uHh5Wy8AAACGAtY+v01CAAAAAAAAAL6QhAAAAAAAAAB8IQkBAAAAAAAA+EISAgDoDygrYcE92cipGQAAAABJRU5ErkJggg==',
  'base64',
)

const step = (page: Page) => page.getByRole('heading', { level: 2 })

/** Answers what each step needs (a new entry) and stops on the photo step. */
async function walkToPhoto(page: Page, answer = true) {
  const answers: Record<string, string> = { Minutes: '30', 'What I struggled with': 'p. 32 #1' }
  for (;;) {
    const label = (await step(page).innerText()).replace(/\s*optional$/, '')
    if (label === 'Notebook photo') return
    const text = answers[label]
    if (answer && text) await page.keyboard.type(text)
    await page.getByRole('button', { name: 'Next' }).click()
  }
}

test.describe('@photo the notebook photo', () => {
  test.use({ storageState: authFile('student') })

  test.beforeEach(async () => {
    await clearEntries(await signedInClient(ACCOUNTS.student.email), 'singapore-math', todayNY())
  })

  test('added offline, it waits on the device, then uploads once with its entry', async ({
    page,
    context,
  }) => {
    const client = await signedInClient(ACCOUNTS.student.email)
    const math = await assignmentId(client, 'singapore-math')
    const session6 = await planItemId(client, 'singapore-math', 6)
    // From Today, as the student would: the dev server has no service worker, so a
    // screen not opened before going offline couldn't load (the installed app has it).
    await page.goto('today')
    await page.getByRole('link', { name: 'Log this session' }).click()
    await expect(page.getByRole('progressbar', { name: 'Progress' })).toBeVisible()
    await walkToPhoto(page)

    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Add a photo' }).click()
    await (await chooser).setFiles({ name: 'notebook.png', mimeType: 'image/png', buffer: PNG })
    await expect(page.getByRole('img', { name: 'Notebook photo, as added' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Replace photo' })).toBeVisible()

    await context.setOffline(true)
    await page.getByRole('button', { name: 'Save' }).click()
    const math_ = page.getByRole('region', { name: 'Singapore Math', exact: true })
    await expect(math_.getByText('· On this device, will sync')).toBeVisible()
    await expect(page.getByText('Saved on this device, will sync')).toBeVisible()
    expect(await entriesOn(client, 'singapore-math', todayNY())).toEqual([])

    await context.setOffline(false)
    await expect(math_.getByText('· Synced')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Synced', { exact: true })).toBeVisible()

    const [entry] = await entriesOn(client, 'singapore-math', todayNY())
    const notebook = (entry?.data as { notebook?: string } | undefined)?.notebook
    expect(notebook).toMatch(/^[0-9a-f-]{36}$/)
    await expect
      .poll(async () => {
        const { data } = await client.from('attachments').select('id, storage_path')
        return (data as { id: string; storage_path: string }[]).filter((a) => a.id === notebook)
      })
      .toHaveLength(1)
    const { data: user } = await client.auth.getUser()
    const { data: objects } = await client.storage
      .from('attachments')
      .list(`${user.user?.id ?? ''}/${entry?.id ?? ''}`)
    expect(objects?.map((o) => o.name)).toEqual([`${notebook ?? ''}.jpg`])

    // Back in the entry, the photo now comes from storage through a short-lived link.
    await page.goto(`log/${math}/${session6}`)
    await expect(page.getByRole('progressbar', { name: 'Progress' })).toBeVisible()
    await walkToPhoto(page, false)
    await expect(page.getByRole('img', { name: 'Notebook photo, as added' })).toHaveAttribute(
      'src',
      /\/storage\/v1\/object\/sign\/attachments\//,
    )
  })
})
