/**
 * pnpm e2e:fixtures
 *
 * LOCAL ONLY. Gives the fake local students assignments, entries and followups dated
 * around today (scripts/e2e-fixtures.sql says exactly what), so the end-to-end tests
 * always have a session today, missed sessions, a locked entry and a review day. Runs
 * after `pnpm supabase db reset` and `pnpm seed`, through the Supabase CLI.
 *
 * When the local book-pages bucket has no pages (CI never has the book), it also puts a
 * placeholder page (scripts/fixtures/sample-page.webp) under every planned page number,
 * so sessions show images. Real pages from `pnpm book:pages` are left alone.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { PlanFile, TrackersFile } from '../src/trackers/definition.ts'

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

function cliOut(args: string[]): string {
  const run = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' })
  if (run.status !== 0) {
    console.error(run.stderr || run.stdout)
    process.exit(run.status ?? 1)
  }
  return run.stdout
}

/**
 * How many pages the local bucket holds for a tracker. JSON output, read whichever way
 * the CLI shapes it (an array of rows, or {rows} when it detects an agent): its default
 * text table differs between a terminal and CI.
 */
function pagesIn(slug: string): number {
  const out = cliOut([
    'db',
    'query',
    '--read-only',
    '--output-format',
    'json',
    `select count(*)::int as pages from storage.objects where bucket_id = 'book-pages' and name like '${slug}/%'`,
  ])
  const start = out.search(/[[{]/)
  const parsed: unknown = JSON.parse(start < 0 ? 'null' : out.slice(start))
  const rows: unknown = Array.isArray(parsed) ? parsed : (parsed as { rows?: unknown } | null)?.rows
  const pages = Array.isArray(rows) ? (rows[0] as { pages?: unknown } | undefined)?.pages : null
  if (typeof pages !== 'number') {
    console.error(`pnpm e2e:fixtures: couldn't count the ${slug} pages:\n${out}`)
    process.exit(1)
  }
  return pages
}

const { trackers } = TrackersFile.parse(
  JSON.parse(readFileSync(join(root, 'seed', 'trackers.json'), 'utf8')),
)
for (const tracker of trackers) {
  if (tracker.cadence.type !== 'plan') continue
  if (pagesIn(tracker.slug) > 0) continue
  const plan = PlanFile.parse(
    JSON.parse(readFileSync(join(root, tracker.cadence.plan_source), 'utf8')),
  )
  const pages = plan.sessions.flatMap((s) =>
    s.page_start === null || s.page_end === null ? [] : [s.page_start, s.page_end],
  )
  const dir = join(root, 'supabase', '.temp', 'fixture-pages', tracker.slug)
  mkdirSync(dir, { recursive: true })
  for (let page = Math.min(...pages); page <= Math.max(...pages); page += 1) {
    copyFileSync(
      join(root, 'scripts', 'fixtures', 'sample-page.webp'),
      join(dir, `${String(page).padStart(3, '0')}.webp`),
    )
  }
  // Relative, and into the bucket's root (see scripts/book-pages.ts for why).
  cliOut([
    'storage',
    'cp',
    '--experimental',
    '--recursive',
    '--content-type',
    'image/webp',
    `supabase/.temp/fixture-pages/${tracker.slug}`,
    'ss:///book-pages',
  ])
  console.log(`pnpm e2e:fixtures: placeholder pages for ${tracker.slug} (no real ones locally)`)
}
