/**
 * pnpm seed [--remote]
 *
 * Validates seed/trackers.json and the plan files it names, then upserts them into
 * trackers and plan_templates through the Supabase CLI (`supabase db query`). Local by
 * default; --remote targets the linked cloud project, and the CLI asks you to confirm.
 * It runs with your CLI login, so no service key is ever needed on this machine.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { PlanFile, TrackersFile } from '../src/trackers/definition.ts'
import { buildSeedSql, SEED_SUMMARY_SQL } from './seed-sql.ts'

const root = resolve(import.meta.dirname, '..')
const remote = process.argv.includes('--remote')

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(join(root, path), 'utf8'))
}

function fail(message: string): never {
  console.error(`pnpm seed: ${message}`)
  process.exit(1)
}

const parsed = TrackersFile.safeParse(readJson('seed/trackers.json'))
if (!parsed.success) fail(`seed/trackers.json is invalid:\n${parsed.error.message}`)
const { trackers } = parsed.data

const plans = new Map<string, PlanFile>()
for (const tracker of trackers) {
  if (tracker.cadence.type !== 'plan' || !tracker.cadence.plan_source) continue
  const source = tracker.cadence.plan_source
  const plan = PlanFile.safeParse(readJson(source))
  if (!plan.success) fail(`${source} is invalid:\n${plan.error.message}`)
  if (plan.data.tracker !== tracker.slug) {
    fail(`${source} is for "${plan.data.tracker}", but ${tracker.slug} points to it`)
  }
  plans.set(tracker.slug, plan.data)
}

const sqlFile = join(root, 'supabase', '.temp', 'seed-trackers.sql')
mkdirSync(dirname(sqlFile), { recursive: true })
writeFileSync(sqlFile, buildSeedSql({ trackers, plans }))

const cli = join(
  dirname(createRequire(import.meta.url).resolve('supabase/package.json')),
  'dist',
  'supabase.js',
)
const target = remote ? ['--remote'] : []

function supabase(...args: string[]): void {
  const result = spawnSync(process.execPath, [cli, ...args, ...target], {
    cwd: root,
    stdio: 'inherit',
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.log(
  `pnpm seed: ${String(trackers.length)} trackers, ${String(plans.size)} plan template(s) -> ${remote ? 'linked cloud project' : 'local database'}`,
)
supabase('db', 'query', '--file', sqlFile)
supabase('db', 'query', '--read-only', SEED_SUMMARY_SQL)
