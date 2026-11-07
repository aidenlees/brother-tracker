/**
 * Shared test cases for every field type. Vitest runs them through the Zod schemas
 * (registry.test.ts), and the same cases become pgTAP checks of public.field_check_<type>
 * (13_field_parity.sql, written by `pnpm gen:parity`), so the browser and the database
 * can't quietly disagree. Values here are always present; blanks are the entry's job.
 */
import type { FieldDefinition, FieldTypeName, PlanDetails } from '../definition'

export type TypeFixture = {
  field: FieldDefinition
  /** The plan item's details, for types that read it (the trigger passes field -> 'plan'). */
  plan?: PlanDetails
  valid: unknown[]
  invalid: unknown[]
}

const base = (type: FieldTypeName, extra: Partial<FieldDefinition> = {}): FieldDefinition => ({
  key: 'value',
  type,
  label: 'Value',
  required: false,
  ...extra,
})

const twoOptions = {
  options: [
    { key: 'a', label: 'A' },
    { key: 'b', label: 'B' },
  ],
}

/** A string of 200 characters that is 400 UTF-16 units long. */
const astral200 = '\u{1D11E}'.repeat(200)

export const TYPE_FIXTURES: Record<FieldTypeName, TypeFixture> = {
  number: {
    field: base('number', { min: 0, max: 10 }),
    valid: [0, 2.5, 10],
    invalid: ['5', 11, -1, true, {}],
  },
  counter: {
    field: base('counter'),
    valid: [0, 7],
    invalid: [-1, 1.5, '2', false],
  },
  tally_group: {
    field: base('tally_group', twoOptions),
    valid: [{}, { a: 3 }, { a: 0, b: 2 }],
    invalid: [[], 3, { c: 1 }, { a: -1 }, { a: 1.5 }, { a: '1' }],
  },
  checkbox: {
    field: base('checkbox'),
    valid: [true, false],
    invalid: ['true', 1],
  },
  checklist: {
    field: base('checklist', twoOptions),
    valid: [{}, { a: true }, { a: false, b: true }],
    invalid: [{ c: true }, { a: 1 }, ['a'], true],
  },
  select: {
    field: base('select', twoOptions),
    valid: ['a', 'b'],
    invalid: ['c', 1, ['a']],
  },
  multi_select: {
    field: base('multi_select', twoOptions),
    valid: [[], ['a'], ['b', 'a']],
    invalid: [['a', 'a'], ['c'], 'a', [1]],
  },
  short_text: {
    field: base('short_text'),
    valid: ['a', astral200, 'x'.repeat(200)],
    invalid: ['x'.repeat(201), 5, ['a']],
  },
  long_text: {
    field: base('long_text'),
    valid: ['line one\nline two', 'x'.repeat(5000)],
    invalid: ['x'.repeat(5001), 3],
  },
  duration: {
    field: base('duration'),
    valid: [0, 45, 1440],
    invalid: [-1, 1441, 4.5, '45'],
  },
  rating_1_5: {
    field: base('rating_1_5'),
    valid: [1, 5],
    invalid: [0, 6, 2.5, '3'],
  },
  page_range: {
    field: base('page_range'),
    valid: [
      { start: 1, end: 1 },
      { start: 31, end: 32 },
    ],
    invalid: [
      { start: 5, end: 4 },
      { start: 0, end: 2 },
      { start: 1 },
      [1, 2],
      { start: '1', end: '2' },
    ],
  },
  yes_no: {
    field: base('yes_no'),
    valid: [true, false],
    invalid: ['yes', 0],
  },
  photo: {
    field: base('photo'),
    valid: ['0f8fad5b-d9cb-469f-a165-70867728950e'],
    invalid: ['0F8FAD5B-D9CB-469F-A165-70867728950E', 'not-a-photo', 5],
  },
  plan_checklist: {
    field: base('plan_checklist', { optionsFrom: 'plan.problems' }),
    plan: { problems: ['p. 31 #3', 'p. 31 #4', 'p. 32 #5(a)'] },
    valid: [[], ['p. 31 #4'], ['p. 31 #3', 'p. 32 #5(a)']],
    invalid: [['p. 33 #7'], ['p. 31 #4', 'p. 31 #4'], 'p. 31 #4', [4], {}, ['P. 31 #4'], true],
  },
}
