/**
 * pnpm e2e:fixtures
 *
 * LOCAL ONLY. Gives the fake local students assignments, entries and followups dated
 * around today (scripts/e2e-fixtures.sql says exactly what), so the end-to-end tests
 * always have a session today, missed sessions, a locked entry and a review day. Runs
 * after `pnpm supabase db reset` and `pnpm seed`, through the Supabase CLI.
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

if (process.argv.includes('--remote') || process.argv.includes('--linked')) {
  console.error('pnpm e2e:fixtures: local only. It never runs against the cloud project.')
  process.exit(1)
}

const root = resolve(import.meta.dirname, '..')
const cli = join(
  dirname(createRequire(import.meta.url).resolve('supabase/package.json')),
  'dist',
  'supabase.js',
)
const result = spawnSync(
  process.execPath,
  [cli, 'db', 'query', '--file', join(root, 'scripts', 'e2e-fixtures.sql')],
  { cwd: root, encoding: 'utf8' },
)
if (result.status !== 0) {
  console.error(result.stderr || result.stdout)
  process.exit(result.status ?? 1)
}
console.log('pnpm e2e:fixtures: local test students set up around today')
