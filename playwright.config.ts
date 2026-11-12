import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests against the local Supabase stack.
 * Before running: pnpm supabase start && pnpm supabase db reset && pnpm seed &&
 * pnpm e2e:fixtures && pnpm env:local
 *
 *   chromium  the dev server (most specs)
 *   pwa       a production build on `vite preview`, because only a build has the
 *             service worker (pwa.spec.ts)
 */
const DEV_URL = 'http://localhost:5173/brother-tracker/'
const PREVIEW_URL = 'http://localhost:4173/brother-tracker/'

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // One at a time: the specs share the fake students' rows in the local database, so
  // two files logging the same session at once would trip over each other.
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    // Relative paths only (page.goto('today')), so they stay under the base path.
    baseURL: DEV_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testIgnore: /pwa\.spec\.ts/,
    },
    {
      name: 'pwa',
      use: { ...devices['Desktop Chrome'], baseURL: PREVIEW_URL },
      testMatch: /pwa\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'pnpm dev',
      url: DEV_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm build && pnpm preview',
      url: PREVIEW_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      // The Edge Functions (admin-users, for People), on the local stack. Ready once a
      // request without a session is refused.
      command: 'pnpm supabase functions serve',
      url: 'http://127.0.0.1:54321/functions/v1/admin-users',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
})
