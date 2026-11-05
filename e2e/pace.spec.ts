import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { ACCOUNTS, authFile } from './accounts'
import { clearEntries, todayNY } from './data'
import { signedInClient } from './supabase'

/**
 * @pace: CLAUDE.md's speed promises, played at a student's speed rather than a script's.
 *
 * Logging math takes under 2 minutes; a daily check-in about 10 seconds. A person, not
 * the app, sets most of that time, so this test acts like one: 1.5 s to read each
 * screen, 1 s per tally, typing at 40 words a minute (300 ms a key). If a change adds a
 * step, a field or a slow screen, the total goes over budget and the test fails, with a
 * per-step breakdown in the report. The real check is the student, on the laptop, with a
 * stopwatch (see the Phase 2 plan).
 */
const READ_MS = 1500
const TAP_MS = 1000
const KEY_MS = 300
const MATH_BUDGET_MS = 120_000
const VIOLIN_BUDGET_MS = 15_000
const MAX_STEPS = 9
/** Pressing Enter to seeing the next screen. */
const TRANSITION_BUDGET_MS = 300

type Lap = { step: string; ms: number }

function report(testInfo: TestInfo, title: string, laps: Lap[], total: number) {
  const lines = [
    `${title}: ${(total / 1000).toFixed(1)} s`,
    ...laps.map((l) => `  ${l.step.padEnd(32)} ${(l.ms / 1000).toFixed(1).padStart(5)} s`),
  ]
  console.log(lines.join('\n'))
  return testInfo.attach(`${title} breakdown`, {
    body: lines.join('\n'),
    contentType: 'text/plain',
  })
}

const heading = (page: Page) => page.getByRole('heading', { level: 2 })

test.describe('@pace logging at a student’s speed', () => {
  test.use({ storageState: authFile('student') })
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async () => {
    const client = await signedInClient(ACCOUNTS.student.email)
    await clearEntries(client, 'singapore-math', todayNY())
    await clearEntries(client, 'violin', todayNY())
  })

  test('a math session in under 2 minutes', async ({ page }, testInfo) => {
    test.setTimeout(240_000)
    await page.goto('today')
    await expect(page.getByRole('link', { name: 'Log this session' })).toBeVisible()

    const laps: Lap[] = []
    const transitions: number[] = []
    let mark = Date.now()
    const lap = (step: string) => {
      const now = Date.now()
      laps.push({ step, ms: now - mark })
      mark = now
    }
    const start = Date.now()

    /** Enter, then the next screen: timed as a transition. */
    async function next(expected?: string) {
      const before = Date.now()
      await page.keyboard.press('Enter')
      if (expected) await expect(heading(page)).toContainText(expected)
      transitions.push(Date.now() - before)
    }
    const read = () => page.waitForTimeout(READ_MS)
    const type = (text: string) => page.keyboard.type(text, { delay: KEY_MS })

    await read()
    await page.getByRole('link', { name: 'Log this session' }).click()
    await expect(page.getByRole('progressbar', { name: 'Progress' })).toBeVisible()
    await expect(heading(page)).toContainText("Today's checklist")
    lap('open the session')

    await read()
    for (let i = 0; i < 4; i += 1) {
      if (i > 0) await page.keyboard.press('Tab')
      await page.waitForTimeout(TAP_MS / 2)
      await page.keyboard.press('Space')
    }
    await next('How each problem went')
    lap('checklist (4 ticks)')

    await read()
    for (const key of 'iiiiihhs') {
      await page.waitForTimeout(TAP_MS)
      await page.keyboard.press(key)
    }
    await next('Problems to retry')
    lap('tally (8 problems)')

    await read()
    await type('p. 31 #4')
    await page.keyboard.press('Enter')
    await next('Minutes')
    lap('one retry')

    await read()
    await type('45')
    await next('Key idea or error to watch')
    lap('minutes')

    await read()
    await type('assume all chickens, then fix the difference')
    await next('What I did')
    lap('key idea (45 characters)')

    await read()
    await type(', checked them all')
    await next('What I struggled with')
    lap('what I did (prefilled, +18)')

    await read()
    await type('p. 31 #4: why the difference is 2 legs a head')
    await next('Reflection')
    lap('what I struggled with (45)')

    await read()
    await next('Notebook photo')
    lap('reflection (skipped)')

    await read()
    const steps = Number(/of (\d+)/.exec(await page.getByText(/^\d+ of \d+$/).innerText())?.[1])
    await next()
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
    await expect(
      page
        .getByRole('region', { name: 'Singapore Math', exact: true })
        .getByText('Saved', { exact: true }),
    ).toBeVisible()
    lap('photo (skipped), save')

    const total = Date.now() - start
    await report(testInfo, 'Math log', laps, total)
    expect(steps, 'steps in the math log').toBeLessThanOrEqual(MAX_STEPS)
    expect(Math.max(...transitions), 'slowest step-to-step transition (ms)').toBeLessThan(
      TRANSITION_BUDGET_MS,
    )
    expect(total, 'math log at a student’s pace (ms)').toBeLessThan(MATH_BUDGET_MS)
  })

  test('a violin check-in in about 10 seconds', async ({ page }, testInfo) => {
    await page.goto('today')
    const violin = page.getByRole('region', { name: 'Violin', exact: true })
    await expect(violin.getByText('Did you practice today?')).toBeVisible()

    const start = Date.now()
    await page.waitForTimeout(READ_MS)
    await violin.getByText('Yes', { exact: true }).click()
    await page.keyboard.type('shift to 3rd, bar 12', { delay: KEY_MS })
    await page.keyboard.press('Enter')
    await expect(violin.getByText('Saved', { exact: true })).toBeVisible()
    const total = Date.now() - start

    await report(
      testInfo,
      'Violin check-in',
      [{ step: 'read, Yes, focus, Enter', ms: total }],
      total,
    )
    expect(total, 'violin check-in at a student’s pace (ms)').toBeLessThan(VIOLIN_BUDGET_MS)
  })
})
