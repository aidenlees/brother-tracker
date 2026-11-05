// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FIELD_TYPES, PlanFile, TrackersFile } from '../src/trackers/definition.ts'
import { buildSeedSql, SEED_TEMPLATE_NAME } from './seed-sql.ts'

const read = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'))

const { trackers } = TrackersFile.parse(read('seed/trackers.json'))
const math = PlanFile.parse(read('seed/math_sessions.json'))
const sql = buildSeedSql({ trackers, plans: new Map([['singapore-math', math]]) })

describe('seed files', () => {
  it('match the tracker definition schema', () => {
    expect(trackers.map((t) => t.slug)).toEqual(['singapore-math', 'violin'])
  })

  it('hold the 80-session math plan', () => {
    expect(math.sessions).toHaveLength(80)
    expect(math.sessions[0]?.date).toBe('2026-11-01')
  })
})

describe('buildSeedSql', () => {
  it('is a single DO block, so it applies atomically', () => {
    expect(sql.startsWith('do $seed$\nbegin\n')).toBe(true)
    expect(sql.trimEnd().endsWith('end\n$seed$;')).toBe(true)
    expect(sql.match(/\$seed\$/g)).toHaveLength(2)
  })

  it('upserts trackers by slug, skipping rows that have not changed', () => {
    expect(sql).toContain('on conflict (slug) do update set')
    expect(sql).toMatch(/where \(trackers\.name, .*\)\s+is distinct from \(excluded\.name/)
  })

  it('upserts the plan template by tracker and name', () => {
    expect(sql).toContain(`'${SEED_TEMPLATE_NAME}'`)
    expect(sql).toContain('on conflict (tracker_id, name) do update set')
    expect(sql).toContain("date '2026-11-01'")
  })

  it('stores pacing flags under pacing_flags and drops the seed-only plan_source', () => {
    expect(sql).toContain('"key":"slow_down"')
    expect(sql).not.toContain('plan_source')
    expect(sql).toContain(`'{"type":"plan"}'::jsonb`)
  })

  it('keeps each session number in the plan item details', () => {
    expect(sql).toContain('"details":{"session":80,')
  })

  it('escapes single quotes', () => {
    // The math checklist label is "Today's checklist".
    expect(sql).toContain("Today''s checklist")
    expect(sql).not.toMatch(/Today's/)
  })

  it('never touches people', () => {
    expect(sql).not.toMatch(/profiles|viewer_links|assignments|auth\./)
  })
})

describe('field types', () => {
  it('each registry type has exactly one SQL check, and every check is a registry type', () => {
    const migrations = new URL('../supabase/migrations/', import.meta.url)
    const checks = readdirSync(migrations)
      .flatMap((file) => [
        ...readFileSync(new URL(file, migrations), 'utf8').matchAll(
          /create (?:or replace )?function public\.field_check_([a-z0-9_]+)\(/g,
        ),
      ])
      .map((m) => m[1])
    expect([...checks].sort()).toEqual([...FIELD_TYPES].sort())
  })
})
