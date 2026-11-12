/**
 * What a nightly backup holds (.github/workflows/backup.yml writes roles.sql, schema.sql
 * and data.sql into one .tar.gz), and whether it's whole: every table the migrations
 * make is defined and has its data, the accounts are in it, and how many rows each has.
 * `pnpm backup:check <file>` runs it on a copy downloaded from the dashboard.
 */

/** A NUL-padded text field of a tar header, as a string. */
function field(archive: Uint8Array, from: number, length: number): string {
  const bytes = archive.subarray(from, from + length)
  const end = bytes.indexOf(0)
  return new TextDecoder().decode(end === -1 ? bytes : bytes.subarray(0, end))
}

/**
 * The regular files in a tar archive (ustar, as GNU and BSD tar write it), by name.
 * Enough for a backup's three plain files, and the same on every system: there's no
 * `tar` to find, and no drive letter for one to misread.
 */
export function untar(archive: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>()
  let at = 0
  let longName: string | null = null
  while (at + 512 <= archive.length) {
    const name = field(archive, at, 100)
    if (!name) break
    const size = parseInt(field(archive, at + 124, 12).trim() || '0', 8)
    const type = archive[at + 156] ?? 0
    const prefix = field(archive, at + 345, 155)
    const body = archive.subarray(at + 512, at + 512 + size)
    if (type === 0x4c) {
      // GNU long name ("L"): the next entry's full name.
      longName = field(body, 0, body.length)
    } else {
      const full = longName ?? (prefix ? `${prefix}/${name}` : name)
      longName = null
      // "0" or NUL: a regular file. Directories, links and pax headers are skipped.
      if (type === 0x30 || type === 0) files.set(full.replace(/^\.\//, ''), body)
    }
    at += 512 + Math.ceil(size / 512) * 512
  }
  return files
}

/** Every table the migrations create in public (a test keeps this list in step). */
export const TABLES = [
  'profiles',
  'viewer_links',
  'trackers',
  'tracker_versions',
  'plan_templates',
  'assignments',
  'plan_items',
  'entries',
  'followups',
  'attachments',
  'comments',
  'audit_log',
  'push_subscriptions',
] as const

/** Rows per table in a pg_dump data file: the lines between each `COPY … FROM stdin;` and `\.`. */
export function copyCounts(data: string): Map<string, number> {
  const counts = new Map<string, number>()
  let table: string | null = null
  let rows = 0
  for (const line of data.split(/\r?\n/)) {
    if (table === null) {
      const start = /^COPY "([^"]+)"\."([^"]+)"[^;]* FROM stdin;$/.exec(line)
      if (start) {
        table = `${start[1] ?? ''}.${start[2] ?? ''}`
        rows = 0
      }
    } else if (line === '\\.') {
      counts.set(table, (counts.get(table) ?? 0) + rows)
      table = null
    } else {
      rows += 1
    }
  }
  return counts
}

/** Tables a schema file defines, as "schema.table". */
export function definedTables(schema: string): Set<string> {
  return new Set(
    [...schema.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"([^"]+)"\."([^"]+)"/g)].map(
      (m) => `${m[1] ?? ''}.${m[2] ?? ''}`,
    ),
  )
}

export type Check = {
  ok: boolean
  problems: string[]
  counts: { table: string; rows: number }[]
}

/** Is the backup whole? Each problem in words; the row counts either way. */
export function checkBackup(files: { roles: string; schema: string; data: string }): Check {
  const problems: string[] = []
  if (!files.roles.trim()) {
    problems.push('roles.sql is empty: the database roles would be missing.')
  }
  const defined = definedTables(files.schema)
  const counts = copyCounts(files.data)
  for (const table of TABLES) {
    const name = `public.${table}`
    if (!defined.has(name)) problems.push(`schema.sql doesn’t define ${name}.`)
    if (!counts.has(name)) problems.push(`data.sql has no data for ${name}.`)
  }
  if (!counts.has('auth.users')) {
    problems.push('data.sql has no auth.users: nobody could sign in after a restore.')
  }
  return {
    ok: problems.length === 0,
    problems,
    counts: ['auth.users', ...TABLES.map((t) => `public.${t}`)].map((table) => ({
      table,
      rows: counts.get(table) ?? 0,
    })),
  }
}
