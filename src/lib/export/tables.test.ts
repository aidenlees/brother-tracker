import { describe, expect, it } from 'vitest'
import type { FieldDefinition } from '@/trackers/definition'
import {
  allFields,
  commentsTable,
  fileName,
  retriesTable,
  stamp,
  trackerTable,
  type ExportEntry,
  type ExportTracker,
} from './tables'

const fields: FieldDefinition[] = [
  { key: 'completed', type: 'yes_no', label: 'Did you complete the problems?', required: true },
  {
    key: 'struggled',
    type: 'plan_checklist',
    label: 'Which problems did you struggle with?',
    required: false,
    optionsFrom: 'plan.problems',
  },
  { key: 'minutes', type: 'number', label: 'Minutes', required: true },
]

const entry = (over: Partial<ExportEntry> = {}): ExportEntry => ({
  id: 'e1',
  date: '2026-11-09',
  createdAt: '2026-11-10T01:15:00+00:00',
  updatedAt: '2026-11-10T01:15:00+00:00',
  data: { completed: true, struggled: ['p. 30 #2'], minutes: 40 },
  plan: {
    id: 'p4',
    assignment_id: 'a1',
    date: '2026-11-09',
    title: 'Session 4',
    details: { session: 4, topic: 'Solve by Assuming', page_start: 25, page_end: 31 },
    sort: 4,
  },
  retries: [{ label: 'p. 30 #2', due_date: '2026-11-11', status: 'open' }],
  comments: [],
  ...over,
})

const math = (entries: ExportEntry[]): ExportTracker => ({
  name: 'Singapore Math',
  cadence: 'plan',
  fields,
  entries,
})

describe('export tables', () => {
  it('writes times in New York, sortable', () => {
    expect(stamp('2026-11-10T01:15:00+00:00')).toBe('2026-11-09 20:15')
  })

  it('makes a row per log, oldest first, a column per field, numbers as numbers', () => {
    const later = entry({
      id: 'e2',
      date: '2026-11-10',
      data: { completed: false, struggled: [], minutes: 25 },
      retries: [],
      updatedAt: '2026-11-11T02:00:00+00:00',
    })
    const table = trackerTable(math([later, entry()]))
    expect(table.header).toEqual([
      'Date',
      'Planned for',
      'Session',
      'Pages',
      'Did you complete the problems?',
      'Which problems did you struggle with?',
      'Minutes',
      'Retries',
      'Comments',
      'Logged',
      'Last changed',
    ])
    expect(table.rows[0]).toEqual([
      '2026-11-09',
      '2026-11-09',
      'Session 4 · Solve by Assuming',
      '25–31',
      'Yes',
      'p. 30 #2',
      40,
      'p. 30 #2 (open)',
      0,
      '2026-11-09 20:15',
      null,
    ])
    expect(table.rows[1]?.[6]).toBe(25)
    expect(table.rows[1]?.[10]).toBe('2026-11-10 21:00')
  })

  it('leaves out columns nothing fills, like Pages for a daily tracker', () => {
    const violin: ExportTracker = {
      name: 'Violin',
      cadence: 'daily',
      fields: [
        { key: 'practiced', type: 'yes_no', label: 'Did you practice today?', required: true },
        { key: 'focus', type: 'short_text', label: 'Focus', required: false },
      ],
      entries: [entry({ data: { practiced: false }, plan: null, retries: [] })],
    }
    expect(trackerTable(violin).header).toEqual([
      'Date',
      'Did you practice today?',
      'Comments',
      'Logged',
    ])
  })

  it('keeps fields only older versions had, after the current ones', () => {
    const merged = allFields([
      {
        field_version: 1,
        fields: [
          fields[0] as FieldDefinition,
          { key: 'did', type: 'short_text', label: 'Did', required: false },
        ],
      },
      { field_version: 2, fields },
    ])
    expect(merged.map((f) => f.key)).toEqual(['completed', 'struggled', 'minutes', 'did'])
  })

  it('lists every retry by due date, and every comment oldest first', () => {
    const withComments = entry({
      comments: [
        {
          id: 'c2',
          entryId: 'e1',
          authorId: 'u2',
          author: 'Sam',
          body: 'Thanks.',
          createdAt: '2026-11-10T03:00:00+00:00',
          editedAt: null,
        },
        {
          id: 'c1',
          entryId: 'e1',
          authorId: 'u1',
          author: null,
          body: 'Draw it first.',
          createdAt: '2026-11-10T02:00:00+00:00',
          editedAt: '2026-11-10T02:30:00+00:00',
        },
      ],
    })
    const trackers = [math([withComments])]
    expect(retriesTable(trackers).rows).toEqual([
      [
        'Singapore Math',
        'p. 30 #2',
        'Session 4 · Solve by Assuming, 2026-11-09',
        '2026-11-11',
        'open',
      ],
    ])
    expect(commentsTable(trackers).rows.map((r) => [r[1], r[4], r[5]])).toEqual([
      ['Someone', 'Draw it first.', '2026-11-09 21:30'],
      ['Sam', 'Thanks.', null],
    ])
  })

  it('names files without characters a file system refuses', () => {
    expect(fileName(['Sam', 'Singapore Math', '2026-11-12'], 'csv')).toBe(
      'Sam Singapore Math 2026-11-12.csv',
    )
    expect(fileName(['A/B: C?'], 'xlsx')).toBe('A B C.xlsx')
  })
})
