/**
 * pnpm env:local
 *
 * Writes .env.local (gitignored) for the dev server and e2e tests, pointing at the
 * local Supabase stack. Only the two public values are written: the API URL and the
 * publishable key. The local secret and service keys never leave `supabase status`.
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const cli = join(
  dirname(createRequire(import.meta.url).resolve('supabase/package.json')),
  'dist',
  'supabase.js',
)

const status = spawnSync(process.execPath, [cli, 'status', '-o', 'env'], {
  cwd: root,
  encoding: 'utf8',
})
if (status.status !== 0) {
  console.error(
    'pnpm env:local: `supabase status` failed. Is the local stack running (pnpm supabase start)?',
  )
  process.exit(1)
}

const values = new Map(
  status.stdout
    .split('\n')
    .map((line) => /^([A-Z_]+)="?([^"]*)"?$/.exec(line.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => [m[1] ?? '', m[2] ?? '']),
)
const url = values.get('API_URL')
const key = values.get('PUBLISHABLE_KEY')
if (!url || !key?.startsWith('sb_publishable_')) {
  console.error(
    'pnpm env:local: could not read API_URL and PUBLISHABLE_KEY from `supabase status`.',
  )
  process.exit(1)
}

writeFileSync(
  join(root, '.env.local'),
  `# Written by pnpm env:local for the local Supabase stack. Public values only.\n` +
    `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_PUBLISHABLE_KEY=${key}\n`,
)
console.log(`pnpm env:local: wrote .env.local for ${url}`)
