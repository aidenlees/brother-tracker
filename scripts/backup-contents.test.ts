import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkBackup, copyCounts, definedTables, TABLES } from './backup-contents.ts'

const copy = (table: string, rows: string[]) =>
  [`COPY ${table} ("id") FROM stdin;`, ...rows, '\\.'].join('\n')

const schema = TABLES.map(
  (t) => `CREATE TABLE IF NOT EXISTS "public"."${t}" (\n  "id" uuid\n);`,
).join('\n')
const data = [
  copy('"auth"."users"', ['u1', 'u2', 'u3']),
  ...TABLES.map((t) => copy(`"public"."${t}"`, t === 'entries' ? ['e1', 'e2'] : [])),
].join('\n\n')

describe('backup check', () => {
  it('lists every table the migrations create', () => {
    const dir = resolve(import.meta.dirname, '..', 'supabase', 'migrations')
    const created = new Set(
      readdirSync(dir).flatMap((f) =>
        [...readFileSync(join(dir, f), 'utf8').matchAll(/create table public\.([a-z_]+)/gi)].map(
          (m) => m[1] ?? '',
        ),
      ),
    )
    expect([...created].sort()).toEqual([...TABLES].sort())
  })

  it('counts the rows in each COPY block, empty ones included', () => {
    const counts = copyCounts(data)
    expect(counts.get('auth.users')).toBe(3)
    expect(counts.get('public.entries')).toBe(2)
    expect(counts.get('public.comments')).toBe(0)
  })

  it('reads the tables a schema defines', () => {
    expect(definedTables('CREATE TABLE "public"."entries" (')).toEqual(new Set(['public.entries']))
  })

  it('passes a whole backup, with its counts', () => {
    const result = checkBackup({ roles: 'CREATE ROLE x;', schema, data })
    expect(result.ok).toBe(true)
    expect(result.counts[0]).toEqual({ table: 'auth.users', rows: 3 })
  })

  it('says what a broken one is missing', () => {
    const result = checkBackup({
      roles: '',
      schema: schema.replace('"public"."comments"', '"public"."gone"'),
      data: data.replace(/COPY "auth"\."users"[\s\S]*?\\\./, ''),
    })
    expect(result.ok).toBe(false)
    expect(result.problems).toEqual([
      'roles.sql is empty: the database roles would be missing.',
      'schema.sql doesn’t define public.comments.',
      'data.sql has no auth.users: nobody could sign in after a restore.',
    ])
  })
})

describe('reading the archive', () => {
  it('unpacks the files a real tar wrote', async () => {
    const { spawnSync } = await import('node:child_process')
    const { mkdtempSync, writeFileSync, readFileSync: read, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { untar } = await import('./backup-contents.ts')
    const dir = mkdtempSync(join(tmpdir(), 'untar-'))
    try {
      writeFileSync(join(dir, 'roles.sql'), 'CREATE ROLE x;\n')
      writeFileSync(join(dir, 'data.sql'), 'x'.repeat(1300))
      // Relative paths only, so no tar reads a drive letter as a host.
      const made = spawnSync('tar', ['-cf', 'copy.tar', 'roles.sql', 'data.sql'], { cwd: dir })
      expect(made.status).toBe(0)
      const files = untar(new Uint8Array(read(join(dir, 'copy.tar'))))
      expect(new TextDecoder().decode(files.get('roles.sql'))).toBe('CREATE ROLE x;\n')
      expect(files.get('data.sql')?.length).toBe(1300)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
