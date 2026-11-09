/**
 * pnpm book:pages [--remote]
 *
 * Puts the printed book's pages into the private `book-pages` bucket, so each session
 * shows the pages to work on. For every plan-cadence tracker whose plan file names a
 * book, it renders the plan's pages from the PDF in seed/ (gitignored: the book never
 * enters the repo) to supabase/.temp/book-pages/<slug>/, then uploads them as
 * <slug>/<page>.webp. Local by default; --remote uploads to the linked cloud project.
 *
 * Needs Python 3 with pypdfium2 and Pillow (scripts/book-pages.py does the rendering).
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { PlanFile, TrackersFile } from '../src/trackers/definition.ts'

const root = resolve(import.meta.dirname, '..')
const remote = process.argv.includes('--remote')
const cli = join(
  dirname(createRequire(import.meta.url).resolve('supabase/package.json')),
  'dist',
  'supabase.js',
)

function fail(message: string): never {
  console.error(`pnpm book:pages: ${message}`)
  process.exit(1)
}

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) fail(`${command} ${args.slice(0, 3).join(' ')} … failed`)
}

const pdfs = readdirSync(join(root, 'seed')).filter((f) => f.toLowerCase().endsWith('.pdf'))
if (pdfs.length !== 1 || !pdfs[0]) {
  fail(`put exactly one book PDF in seed/ (found ${String(pdfs.length)})`)
}
const pdf = join(root, 'seed', pdfs[0])

const { trackers } = TrackersFile.parse(
  JSON.parse(readFileSync(join(root, 'seed', 'trackers.json'), 'utf8')),
)
for (const tracker of trackers) {
  if (tracker.cadence.type !== 'plan' || !tracker.cadence.plan_source) continue
  const plan = PlanFile.parse(
    JSON.parse(readFileSync(join(root, tracker.cadence.plan_source), 'utf8')),
  )
  const pages = plan.sessions.flatMap((s) =>
    s.page_start === null || s.page_end === null ? [] : [s.page_start, s.page_end],
  )
  if (pages.length === 0) continue
  const first = Math.min(...pages)
  const last = Math.max(...pages)
  const out = join(root, 'supabase', '.temp', 'book-pages', tracker.slug)

  console.log(
    `pnpm book:pages: ${tracker.slug}, printed pages ${String(first)}-${String(last)} -> ${remote ? 'linked cloud project' : 'local storage'}`,
  )
  run(process.platform === 'win32' ? 'python' : 'python3', [
    '-I',
    join(root, 'scripts', 'book-pages.py'),
    pdf,
    String(first),
    String(last),
    String(plan.pdf_offset ?? 0),
    out,
  ])
  // Uploading to the cloud is a hosted change: running this command with --remote is
  // the consent the CLI asks for.
  run(process.execPath, [
    cli,
    'storage',
    'cp',
    '--experimental',
    '--recursive',
    '--content-type',
    'image/webp',
    '--cache-control',
    'max-age=86400',
    // Relative: the CLI reads a Windows path like C:\… as a URL scheme.
    relative(root, out).split(sep).join('/'),
    // Into the bucket's root: the folder (named for the slug) lands as <slug>/, or merges
    // into it if it's there already. Copying onto ss:///book-pages/<slug> would nest it.
    'ss:///book-pages',
    ...(remote ? ['--remote', '--yes'] : []),
  ])
}
