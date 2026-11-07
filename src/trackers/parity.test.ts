// @vitest-environment node
/**
 * Browser and database validation must agree (CLAUDE.md, "Validation"). This file
 * checks the shared fixtures against the Zod side and writes the same cases as pgTAP
 * checks of the SQL side: supabase/tests/database/13_field_parity.sql. `pnpm gen:parity`
 * rewrites that file; this test fails whenever it is stale.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FIELD_TYPES, TrackersFile, type FieldDefinition } from './definition'
import { cleanEntry, type EntryData, type PlanDetails } from './entry'
import { TYPE_FIXTURES } from './fields/fixtures'
import { FIELD_REGISTRY } from './fields/registry'

const { trackers } = TrackersFile.parse(
  JSON.parse(readFileSync(new URL('../../seed/trackers.json', import.meta.url), 'utf8')),
)
const fieldsOf = (slug: string): FieldDefinition[] => {
  const tracker = trackers.find((t) => t.slug === slug)
  if (!tracker) throw new Error(`seed/trackers.json has no ${slug}`)
  return tracker.fields
}

const PRACTICE: PlanDetails = {
  session: 6,
  week: 2,
  topic: 'Solve by Assuming',
  assignment: 'Practice pp. 31-32',
  page_start: 31,
  page_end: 32,
  kind: 'practice',
  reading_only: false,
  problems: ['p. 31 #3', 'p. 31 #4', 'p. 32 #5', 'p. 32 #6'],
  pdf_offset: 2,
}
const READING: PlanDetails = {
  session: 1,
  week: 1,
  topic: 'The Four Operations',
  assignment: 'pp. 5-12: parent guidance, notes and examples',
  page_start: 5,
  page_end: 12,
  kind: 'study',
  reading_only: true,
  pdf_offset: 2,
}
const REVIEW: PlanDetails = {
  session: 21,
  week: 6,
  topic: 'Review 1: Chapters 1-5',
  assignment: 'Review pp. 13-35: redo 4 marked problems from Chapters 1-2.',
  page_start: 13,
  page_end: 35,
  kind: 'review',
  reading_only: false,
  pdf_offset: 2,
}

type EntryCase = {
  name: string
  tracker: 'singapore-math' | 'violin'
  plan: PlanDetails
  data: EntryData
  valid: boolean
}

const full = { completed: true, struggled: ['p. 31 #4', 'p. 32 #6'], minutes: 45 }

/** Entries for the launch trackers, as the log flow and the Today card would send them. */
const ENTRY_CASES: EntryCase[] = [
  { name: 'a full session', tracker: 'singapore-math', plan: PRACTICE, data: full, valid: true },
  {
    name: 'nothing was hard',
    tracker: 'singapore-math',
    plan: PRACTICE,
    data: { completed: false, struggled: [], minutes: 20 },
    valid: true,
  },
  {
    name: 'a reading day asks about the reading instead',
    tracker: 'singapore-math',
    plan: READING,
    data: { read: true, minutes: 20 },
    valid: true,
  },
  {
    name: 'answers for the problems on a reading day, which are dropped',
    tracker: 'singapore-math',
    plan: READING,
    data: { read: true, completed: true, struggled: ['p. 31 #4'], minutes: 20 },
    valid: true,
  },
  {
    name: 'a review lists no problems, so a struggle list is dropped',
    tracker: 'singapore-math',
    plan: REVIEW,
    data: { completed: true, struggled: ['p. 31 #4'], minutes: 25 },
    valid: true,
  },
  {
    name: 'no answer to "Did you complete the problems?"',
    tracker: 'singapore-math',
    plan: PRACTICE,
    data: { struggled: [], minutes: 20 },
    valid: false,
  },
  {
    name: 'a problem from another session',
    tracker: 'singapore-math',
    plan: PRACTICE,
    data: { ...full, struggled: ['p. 40 #1'] },
    valid: false,
  },
  {
    name: 'a field the tracker does not have',
    tracker: 'singapore-math',
    plan: PRACTICE,
    data: { ...full, extra: 1 },
    valid: false,
  },
  {
    name: 'a field from the first version (the old checklist)',
    tracker: 'singapore-math',
    plan: PRACTICE,
    data: { ...full, checklist: { attempted: true } },
    valid: false,
  },
  {
    name: 'more minutes than a day has',
    tracker: 'singapore-math',
    plan: PRACTICE,
    data: { ...full, minutes: 2000 },
    valid: false,
  },
  {
    name: 'practice with a focus',
    tracker: 'violin',
    plan: null,
    data: { practiced: true, focus: 'clean shift to 3rd position' },
    valid: true,
  },
  {
    name: 'no practice, so the focus is dropped',
    tracker: 'violin',
    plan: null,
    data: { practiced: false, focus: 'left over from before' },
    valid: true,
  },
  {
    name: 'practice without a focus',
    tracker: 'violin',
    plan: null,
    data: { practiced: true },
    valid: false,
  },
  {
    name: 'a focus of only spaces',
    tracker: 'violin',
    plan: null,
    data: { practiced: true, focus: '   ' },
    valid: false,
  },
  { name: 'no answer at all', tracker: 'violin', plan: null, data: {}, valid: false },
  {
    name: '"yes" as text',
    tracker: 'violin',
    plan: null,
    data: { practiced: 'yes' },
    valid: false,
  },
]

// The pgTAP file -------------------------------------------------------------------

const literal = (text: string) => `'${text.replaceAll("'", "''")}'`

/** A jsonb expression. Long runs of one character use repeat(), to keep the file readable. */
function jsonb(value: unknown): string {
  if (typeof value === 'string') {
    const chars = Array.from(value)
    const first = chars[0]
    if (first !== undefined && chars.length > 100 && chars.every((c) => c === first)) {
      return `to_jsonb(repeat(${literal(first)}, ${chars.length}))`
    }
  }
  return `${literal(JSON.stringify(value))}::jsonb`
}

function describeValue(value: unknown): string {
  if (typeof value === 'string') {
    const chars = Array.from(value)
    if (chars.length > 100) return `${chars.length} characters of ${JSON.stringify(chars[0])}`
  }
  return JSON.stringify(value)
}

function dollarQuoted(sql: string): string {
  if (sql.includes('$$'))
    throw new Error('A fixture contains $$, which the generated SQL quotes with')
  return `$$${sql}$$`
}

function buildParitySql(): string {
  const lines: string[] = []
  let tests = 0
  const test = (line: string) => {
    tests += 1
    lines.push(line)
  }

  lines.push(
    '',
    '-- Field types: the same values public.field_check_<type> must accept and refuse.',
  )
  for (const type of FIELD_TYPES) {
    const { field, plan, valid, invalid } = TYPE_FIXTURES[type]
    // The trigger hands each check the plan item as field -> 'plan'; the fixture does too.
    const asCalled = plan === undefined ? field : { ...field, plan }
    const call = (value: unknown) =>
      `public.field_check_${type}(${jsonb(value)}, ${jsonb(asCalled)})`
    for (const value of valid) {
      test(
        `select is(${call(value)}, null, ${literal(`${type} accepts ${describeValue(value)}`)});`,
      )
    }
    for (const value of invalid) {
      test(
        `select isnt(${call(value)}, null, ${literal(`${type} refuses ${describeValue(value)}`)});`,
      )
    }
  }

  // One assignment per launch tracker, with a plan item for each distinct plan.
  const plans = [...new Set(ENTRY_CASES.map((c) => c.plan).filter((p) => p !== null))]
  const planName = (plan: NonNullable<PlanDetails>) => `parity-plan-${plans.indexOf(plan) + 1}`
  const slugs = [...new Set(ENTRY_CASES.map((c) => c.tracker))]

  lines.push(
    '',
    '-- Entries for the launch trackers, with their fields from seed/trackers.json. The data',
    '-- goes in as the browser holds it and must be stored exactly as cleanEntry tidies it.',
    'do $world$',
    'begin',
    '  perform tests.make_world();',
    '  insert into public.trackers (slug, name, color, cadence, fields) values',
    slugs
      .map((slug) => {
        const tracker = trackers.find((t) => t.slug === slug)
        const cadence = tracker?.cadence.type === 'plan' ? '{"type": "plan"}' : '{"type": "daily"}'
        return `    (${literal(`parity-${slug}`)}, ${literal(`Parity ${slug}`)}, 'ink-blue', '${cadence}', ${jsonb(fieldsOf(slug))})`
      })
      .join(',\n') + ';',
    "  insert into tests.world select slug, id from public.trackers where slug like 'parity-%';",
    ...slugs.map(
      (slug) =>
        `  perform public.assign_tracker(tests.id('student'), ${literal(`parity-${slug}`)}, date '2026-01-01');`,
    ),
    ...plans.map(
      (plan) =>
        `  with p as (insert into public.plan_items (assignment_id, date, title, details) values (tests.assignment('student', 'parity-singapore-math'), date '2026-01-01', ${literal(planName(plan))}, ${jsonb(plan)}) returning id)\n` +
        `  insert into tests.world select ${literal(planName(plan))}, id from p;`,
    ),
    'end $world$;',
  )

  ENTRY_CASES.forEach((c, index) => {
    const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
    const planItem = c.plan ? `tests.id(${literal(planName(c.plan))})` : 'null'
    const insert = dollarQuoted(
      `insert into public.entries (id, assignment_id, plan_item_id, field_version, date, data, owner_id) ` +
        `values ('${id}', tests.assignment('student', 'parity-${c.tracker}'), ${planItem}, 1, ` +
        `date '2026-01-01' + ${index}, ${jsonb(c.data)}, tests.id('student'))`,
    )
    const label = `${c.tracker}: ${c.name}`
    const cleaned = cleanEntry(fieldsOf(c.tracker), c.data, c.plan)
    if (cleaned.ok) {
      test(`select lives_ok(${insert}, ${literal(`${label} is accepted`)});`)
      test(
        `select is((select data from public.entries where id = '${id}'), ${jsonb(cleaned.data)}, ` +
          `${literal(`${label} is stored as the browser cleaned it`)});`,
      )
    } else {
      test(`select throws_ok(${insert}, '23514', null, ${literal(`${label} is refused`)});`)
    }
  })

  return [
    '-- GENERATED by `pnpm gen:parity` from src/trackers/fields/fixtures.ts, the entry cases in',
    '-- src/trackers/parity.test.ts and seed/trackers.json. Do not edit by hand: the Vitest',
    '-- test fails when this file is stale.',
    '--',
    '-- The browser (Zod, src/trackers) and the database (field checks and entries_validate)',
    '-- must agree, or the offline outbox would hold entries the server refuses.',
    'begin;',
    '\\ir _helpers.psql',
    `select plan(${tests});`,
    ...lines,
    '',
    'select * from finish();',
    'rollback;',
    '',
  ].join('\n')
}

// The checks ------------------------------------------------------------------------

describe('field type fixtures', () => {
  it('cover every field type', () => {
    expect(Object.keys(TYPE_FIXTURES).sort()).toEqual([...FIELD_TYPES].sort())
  })

  for (const type of FIELD_TYPES) {
    const { field, plan, valid, invalid } = TYPE_FIXTURES[type]
    const schema = FIELD_REGISTRY[type].schema(field, plan ?? null)
    it(`${type}: Zod accepts the valid values and refuses the rest`, () => {
      for (const value of valid)
        expect(schema.safeParse(value).success, describeValue(value)).toBe(true)
      for (const value of invalid)
        expect(schema.safeParse(value).success, describeValue(value)).toBe(false)
    })
  }
})

describe('entry cases', () => {
  for (const c of ENTRY_CASES) {
    it(`${c.tracker}: ${c.name} is ${c.valid ? 'accepted' : 'refused'}`, () => {
      expect(cleanEntry(fieldsOf(c.tracker), c.data, c.plan).ok).toBe(c.valid)
    })
  }
})

describe('13_field_parity.sql', () => {
  it('matches the fixtures (run pnpm gen:parity after changing them)', async () => {
    await expect(buildParitySql()).toMatchFileSnapshot(
      '../../supabase/tests/database/13_field_parity.sql',
    )
  })
})
