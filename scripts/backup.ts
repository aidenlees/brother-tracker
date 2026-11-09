/**
 * node scripts/backup.ts <archive.tar.gz> <YYYY-MM-DD>
 *
 * The nightly backup's last step (.github/workflows/backup.yml): uploads tonight's copy
 * of the database to the private `backups` bucket as <day>.tar.gz (replacing one from an
 * earlier run that day), then deletes the copies 30 or more days old.
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_KEY. The service key lives only in Actions
 * secrets, never in the app. Prints names and sizes, never what's inside.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { backupName, expiredBackups, KEEP_DAYS } from './backup-names.ts'

const BUCKET = 'backups'

function fail(message: string): never {
  console.error(`backup: ${message}`)
  process.exit(1)
}

const [file, day] = process.argv.slice(2)
if (!file || !day) fail('usage: node scripts/backup.ts <archive.tar.gz> <YYYY-MM-DD>')
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) fail('set SUPABASE_URL and SUPABASE_SERVICE_KEY')

const storage = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
}).storage.from(BUCKET)

const name = backupName(day)
const bytes = readFileSync(file)
if (bytes.length === 0) fail(`${file} is empty; nothing uploaded`)
const uploaded = await storage.upload(name, bytes, {
  contentType: 'application/gzip',
  upsert: true,
})
if (uploaded.error) fail(`uploading ${name} failed: ${uploaded.error.message}`)
console.log(`backup: uploaded ${name} (${(bytes.length / 1024).toFixed(0)} KB)`)

const listed = await storage.list('', { limit: 1000 })
if (listed.error) fail(`listing the copies failed: ${listed.error.message}`)
const old = expiredBackups(
  listed.data.map((o) => o.name),
  day,
)
if (old.length > 0) {
  const removed = await storage.remove(old)
  if (removed.error) fail(`deleting old copies failed: ${removed.error.message}`)
}
console.log(
  `backup: deleted ${String(old.length)} ${old.length === 1 ? 'copy' : 'copies'} ${String(KEEP_DAYS)} or more days old`,
)
