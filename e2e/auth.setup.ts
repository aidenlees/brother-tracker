import { expect, test as setup } from '@playwright/test'
import { ACCOUNTS, authFile, PASSWORD, ROLES, signIn } from './accounts'

// Sign each role in once and keep the session, so specs don't hit the sign-in rate limit.
for (const role of ROLES) {
  setup(`sign in as ${role}`, async ({ page }) => {
    const account = ACCOUNTS[role]
    await signIn(page, account.email, PASSWORD)
    await expect(page.getByRole('heading', { level: 1, name: account.landing })).toBeVisible()
    await page.context().storageState({ path: authFile(role) })
  })
}
