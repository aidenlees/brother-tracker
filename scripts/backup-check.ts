/**
 * pnpm backup:check <copy.tar.gz>
 *
 * Checks a nightly backup downloaded from the dashboard (Storage -> backups) before you
 * need it: it unpacks the copy in memory, says whether it's whole (roles, every table
 * defined and with its data, the accounts) and how many rows each table has. It reads
 * only the file it's given and touches no database. To restore from a copy, follow the
 * steps at the top of .github/workflows/backup.yml.
 */
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { checkBackup, untar } from './backup-contents.ts'

const file = process.argv[2]
if (!file) {
  console.error('Usage: pnpm backup:check <copy.tar.gz>')
  process.exit(2)
}

let files: Map<string, Uint8Array>
try {
  files = untar(gunzipSync(readFileSync(file)))
} catch (error) {
  console.error(
    `Couldn't unpack ${file}: ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exit(1)
}

const read = (name: string) => new TextDecoder().decode(files.get(name) ?? new Uint8Array())
const result = checkBackup({
  roles: read('roles.sql'),
  schema: read('schema.sql'),
  data: read('data.sql'),
})
const width = Math.max(...result.counts.map((c) => c.table.length))
for (const { table, rows } of result.counts) {
  console.log(`${table.padEnd(width)}  ${String(rows).padStart(6)}`)
}
if (result.ok) {
  console.log('')
  console.log('backup:check: whole. It has everything a restore needs.')
} else {
  console.error('')
  console.error('backup:check: NOT whole:')
  for (const problem of result.problems) console.error(`  - ${problem}`)
  process.exit(1)
}
