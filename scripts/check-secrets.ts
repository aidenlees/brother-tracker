/**
 * Fails if a service key, secret key or JWT appears in the given directories
 * (CLAUDE.md, security rule 10). CI runs it on src/ and on the built dist/.
 *
 * Usage: node scripts/check-secrets.ts <dir> [<dir>...]
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'

const BINARY = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
])

const RULES: { name: string; pattern: RegExp }[] = [
  { name: 'service role reference', pattern: /service_role/i },
  { name: 'Supabase secret key', pattern: /sb_secret_[A-Za-z0-9_-]+/ },
  { name: 'Supabase access token', pattern: /\bsbp_[A-Za-z0-9]{20,}/ },
  { name: 'JWT', pattern: /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/ },
]

const dirs = process.argv.slice(2)
if (dirs.length === 0) {
  console.error('Usage: node scripts/check-secrets.ts <dir> [<dir>...]')
  process.exit(2)
}

function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* files(path)
    else if (!BINARY.has(extname(entry.name).toLowerCase())) yield path
  }
}

const problems: string[] = []
for (const dir of dirs) {
  if (!existsSync(dir)) {
    console.error(
      `check:secrets: ${dir}/ does not exist${dir === 'dist' ? ' (run pnpm build first)' : ''}`,
    )
    process.exit(2)
  }
  for (const file of files(dir)) {
    const text = readFileSync(file, 'utf8')
    for (const rule of RULES) {
      const match = rule.pattern.exec(text)
      if (match) {
        const line = text.slice(0, match.index).split('\n').length
        // Print only the start of the match so a real secret never lands in CI logs.
        problems.push(`${file}:${line}  ${rule.name} (${match[0].slice(0, 12)}…)`)
      }
    }
  }
}

if (problems.length > 0) {
  console.error('Possible secrets found:')
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}
console.log(`check:secrets: clean (${dirs.join(', ')})`)
