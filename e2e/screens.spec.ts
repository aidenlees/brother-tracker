import { expect, test, type Page } from '@playwright/test'
import { ACCOUNTS, authFile, PASSWORD, ROLES, signIn } from './accounts'
import {
  addDays,
  assignmentId,
  clearComments,
  clearEntries,
  planItemId,
  resetTasks,
  seedTasks,
  todayNY,
} from './data'
import { localSql, signedInClient } from './supabase'

/**
 * Screenshots for review, not comparison (CLAUDE.md, "Look at what you build"): every
 * screen and state at desktop and phone sizes, light and dark, written to
 * test-results/screens/. Fonts render differently per OS, so nothing is diffed.
 */
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
] as const
const THEMES = ['light', 'dark'] as const

const heading = (page: Page) => page.getByRole('heading', { level: 2 })

/** Someone comments on a student's logged session (and, given a reply, the student answers). */
async function converse(
  from: string,
  student: string,
  session: number,
  body: string,
  reply?: string,
): Promise<void> {
  const owner = await signedInClient(student)
  const { data, error } = await owner
    .from('entries')
    .select('id')
    .eq('plan_item_id', await planItemId(owner, 'singapore-math', session))
    .single()
  if (error) throw error
  const author = await signedInClient(from)
  const first = await author.from('comments').insert({ entry_id: data.id, body })
  if (first.error) throw first.error
  if (reply) {
    const second = await owner.from('comments').insert({ entry_id: data.id, body: reply })
    if (second.error) throw second.error
  }
}

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`${viewport.name} ${theme}`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: theme,
        // Settles transitions instantly (tokens.css honours reduced motion), so a
        // screenshot never catches the nav underline mid-fade after a redirect.
        reducedMotion: 'reduce',
      })
      test.describe.configure({ mode: 'serial' })

      const shot = (page: Page, name: string) =>
        page.screenshot({
          path: `test-results/screens/${name}-${viewport.name}-${theme}.png`,
          fullPage: true,
        })

      /** After the data (and any page images) are in, so the shot shows the screen. */
      const settled = async (page: Page) => {
        await expect(page.getByRole('status')).toHaveCount(0)
        // Page images: their signed links are in (no loading placeholders) and drawn.
        await page.waitForFunction(
          "!document.querySelector('.animate-pulse') && [...document.images].every((i) => i.complete && i.naturalWidth > 0)",
        )
      }

      test('login', async ({ page }) => {
        await page.goto('login')
        await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
        await shot(page, 'login')
      })

      for (const role of ROLES) {
        test.describe(role, () => {
          test.use({ storageState: authFile(role) })

          test(ACCOUNTS[role].landing, async ({ page }) => {
            if (role === 'student') {
              const client = await signedInClient(ACCOUNTS.student.email)
              await clearEntries(client, 'singapore-math', todayNY())
              await clearEntries(client, 'violin', todayNY())
            }
            await page.goto('')
            await expect(
              page.getByRole('heading', { level: 1, name: ACCOUNTS[role].landing }),
            ).toBeVisible()
            await settled(page)
            await shot(page, role)
          })
        })
      }

      test.describe('admin', () => {
        test.use({ storageState: authFile('admin') })

        test('the plan editor, and editing a session', async ({ page }) => {
          await page.goto('plan')
          await page
            .getByLabel('Student and tracker')
            .selectOption({ label: 'Sam · Singapore Math' })
          await expect(page.getByText(/Session 5 · Solve by Assuming/).first()).toBeVisible()
          await settled(page)
          await shot(page, 'plan')
          await page.getByRole('button', { name: /^Edit .*Session 8 · Working Backward$/ }).click()
          await expect(page.getByRole('form', { name: /^Edit / })).toBeVisible()
          await shot(page, 'plan-edit')
        })

        test('a log in Overview, about to be cleared', async ({ page }) => {
          await page.goto('overview')
          await page.getByLabel('Student').selectOption({ label: 'Sam' })
          const log = page
            .getByRole('region', { name: 'Recent logs' })
            .getByRole('article', { name: 'Singapore Math' })
            .first()
          await log.getByRole('button', { name: 'Clear this log' }).click()
          await expect(log.getByRole('button', { name: 'Keep it' })).toBeFocused()
          await settled(page)
          await shot(page, 'overview-clear')
        })

        test('a week’s numbers in Overview, with a pacing flag', async ({ page }) => {
          const ago = addDays(todayNY(), -2)
          await page.goto(
            `overview?week=${addDays(ago, -new Date(`${ago}T00:00:00Z`).getUTCDay())}`,
          )
          await page.getByLabel('Student').selectOption({ label: 'Riley' })
          await expect(page.getByRole('list', { name: 'Pacing flags' })).toBeVisible()
          await settled(page)
          await shot(page, 'overview-week')
        })

        test('Struggles, with a conversation', async ({ page }) => {
          clearComments()
          await converse(
            ACCOUNTS.admin.email,
            'student2@example.test',
            12,
            'Both of these are about the remainder. Try drawing the bar model before you divide.',
            'Okay. The bar model made #11 make sense.',
          )
          await page.goto('struggles')
          await page.getByLabel('Student').selectOption({ label: 'Riley' })
          await expect(page.getByText('The bar model made #11 make sense.')).toBeVisible()
          await settled(page)
          await shot(page, 'struggles')
          clearComments()
        })

        test('Settings, setting up two-step sign-in', async ({ page }) => {
          const forget = () => {
            localSql(
              `delete from auth.mfa_factors where user_id = (select id from auth.users where email = '${ACCOUNTS.admin.email}')`,
            )
          }
          forget()
          await page.goto('settings')
          await settled(page)
          await shot(page, 'settings')
          await page.getByRole('button', { name: 'Turn on two-step sign-in' }).click()
          await expect(page.getByRole('img', { name: /^QR code/ })).toBeVisible()
          await settled(page)
          await shot(page, 'settings-two-step')
          forget()
        })

        test('Export', async ({ page }) => {
          await page.goto('export')
          await page.getByLabel('Student').selectOption({ label: 'Riley' })
          await expect(page.getByRole('list', { name: 'Tables' })).toBeVisible()
          await settled(page)
          await shot(page, 'export')
        })

        test('the Retry queue', async ({ page }) => {
          await page.goto('retries')
          await page.getByLabel('Student').selectOption({ label: 'Riley' })
          await expect(page.getByRole('region', { name: 'Overdue' })).toBeVisible()
          await settled(page)
          await shot(page, 'retries')
        })
      })

      test.describe('student', () => {
        test.use({ storageState: authFile('student') })

        test('log flow, step by step', async ({ page }) => {
          const client = await signedInClient(ACCOUNTS.student.email)
          await clearEntries(client, 'singapore-math', todayNY())
          const math = await assignmentId(client, 'singapore-math')
          await page.goto(`log/${math}/${await planItemId(client, 'singapore-math', 5)}`)
          await expect(page.getByRole('progressbar', { name: 'Progress' })).toBeVisible()

          await page.keyboard.press('Enter')
          await expect(page.getByRole('alert')).toBeVisible()
          await shot(page, 'log-1-required')
          await page.keyboard.press('y')
          await shot(page, 'log-1-completed')
          await page.keyboard.press('Enter')
          await page.keyboard.press('Tab')
          await page.keyboard.press('Space')
          await expect(page.getByText('1 checked.')).toBeVisible()
          await shot(page, 'log-2-struggled')
          await page.keyboard.press('Enter')
          await expect(heading(page)).toContainText('Minutes')
          await page.keyboard.type('45')
          await shot(page, 'log-3-minutes')

          // Saved: the card shows the check mark and what comes next.
          await page.getByRole('button', { name: 'Save' }).click()
          const card = page.getByRole('region', { name: 'Singapore Math', exact: true })
          await expect(card.getByText('· Synced')).toBeVisible({ timeout: 20_000 })
          await expect(card.getByText(/^Next: /)).toBeVisible()
          await settled(page)
          await shot(page, 'today-math-saved')

          // Editing it offers to clear it.
          await card.getByRole('link', { name: 'Edit' }).click()
          await page.getByRole('button', { name: 'Clear this log' }).click()
          await expect(page.getByRole('button', { name: 'Keep it' })).toBeFocused()
          await shot(page, 'log-clear')
          await clearEntries(client, 'singapore-math', todayNY())
        })

        test('a comment on Today, and the conversation on its session', async ({ page }) => {
          clearComments()
          await converse(
            ACCOUNTS.viewer.email,
            ACCOUNTS.student.email,
            4,
            'You stuck with p. 30 #2 until it worked. Show me how you did it tonight?',
          )
          await page.goto('today')
          const line = page.getByRole('link', { name: /^Jordan commented on Session 4/ })
          await expect(line).toBeVisible()
          await settled(page)
          await shot(page, 'today-comment')
          await line.click()
          await expect(page.getByRole('textbox', { name: 'Reply' })).toBeVisible()
          await settled(page)
          await shot(page, 'session-comments')
          clearComments()
        })

        test('My week, and a session with its pages', async ({ page }) => {
          await page.goto('week')
          await expect(page.getByRole('heading', { level: 1, name: 'My week' })).toBeVisible()
          await settled(page)
          await shot(page, 'week')
          await page.getByRole('link', { name: /^Pages 32–35/ }).click()
          await expect(page.getByRole('img', { name: 'Page 32 of the book' })).toBeVisible()
          await settled(page)
          await shot(page, 'session')
          // A page opens full size, a step from the next one.
          await page.getByRole('button', { name: 'Open page 33' }).click()
          await expect(page.getByRole('dialog', { name: /^Page 33/ })).toBeVisible()
          await settled(page)
          await shot(page, 'session-viewer')
        })

        test('Today: saved on this device, then synced', async ({ page, context }) => {
          const client = await signedInClient(ACCOUNTS.student.email)
          await clearEntries(client, 'violin', todayNY())
          await page.goto('today')
          const violin = page.getByRole('region', { name: 'Violin', exact: true })
          await expect(violin).toBeVisible()

          await context.setOffline(true)
          await violin.getByText('Yes', { exact: true }).click()
          await violin.getByRole('textbox').fill('clean shift to 3rd position in bar 12')
          await violin.getByRole('textbox').press('Enter')
          await expect(violin.getByText('· On this device, will sync')).toBeVisible()
          await shot(page, 'today-saved-offline')

          await context.setOffline(false)
          await expect(violin.getByText('· Synced')).toBeVisible({ timeout: 20_000 })
          await shot(page, 'today-saved')
          await clearEntries(client, 'violin', todayNY())
        })

        test('an entry past its 7 days', async ({ page }) => {
          const client = await signedInClient(ACCOUNTS.student.email)
          const violin = await assignmentId(client, 'violin')
          await page.goto(`log/${violin}?date=${addDays(todayNY(), -8)}`)
          await expect(page.getByText(/^Locked:/)).toBeVisible()
          await shot(page, 'locked')
        })
      })

      test.describe('tasks', () => {
        test.afterEach(resetTasks)

        test('the Tasks screen, and Today with tasks', async ({ browser }) => {
          resetTasks()
          seedTasks('Sam', [
            [addDays(todayNY(), -1), 'Redo p. 31 #4 with me', null],
            [todayNY(), 'Read chapter 3 of Hatchet', 'Bring the book to dinner.'],
            [todayNY(), 'Scales, 10 minutes', null],
            [addDays(todayNY(), 1), 'Read chapter 4 of Hatchet', null],
          ])
          const admin = await browser.newContext({
            storageState: authFile('admin'),
            viewport: { width: viewport.width, height: viewport.height },
            colorScheme: theme,
            reducedMotion: 'reduce',
          })
          const page = await admin.newPage()
          await page.goto('tasks')
          await page.getByLabel('Student').selectOption({ label: 'Sam' })
          await expect(page.getByText('Read chapter 3 of Hatchet')).toBeVisible()
          await settled(page)
          await shot(page, 'tasks')
          await admin.close()

          const student = await browser.newContext({
            storageState: authFile('student'),
            viewport: { width: viewport.width, height: viewport.height },
            colorScheme: theme,
            reducedMotion: 'reduce',
          })
          const today = await student.newPage()
          await today.goto('today')
          const tasks = today.getByRole('region', { name: 'Tasks', exact: true })
          await tasks.getByText('Scales, 10 minutes').click()
          await expect(tasks.getByRole('checkbox', { name: 'Scales, 10 minutes' })).toBeChecked()
          await expect(today.getByText('Synced', { exact: true })).toBeVisible({ timeout: 20_000 })
          await settled(today)
          await shot(today, 'today-tasks')
          await student.close()
        })
      })

      test.describe('a review day, and a tracker that hasn’t started', () => {
        test.use({ storageState: { cookies: [], origins: [] } })

        test('Today', async ({ page }) => {
          await signIn(page, 'student2@example.test', PASSWORD)
          await expect(page.getByText(/^Every open retry/)).toBeVisible()
          await expect(page.getByText(/^Starts /)).toBeVisible()
          await settled(page)
          await shot(page, 'today-review')
        })
      })
    })
  }
}
