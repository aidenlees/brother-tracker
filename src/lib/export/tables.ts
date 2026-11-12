/**
 * What Export writes, as tables (CLAUDE.md, "Everything exports"): one per tracker (a
 * row per log, a column per field the tracker has ever had), then every retry and every
 * comment. Built from data, so a new tracker exports with no code.
 */
import type { Comment } from '@/lib/comments'
import { APP_TIME_ZONE } from '@/lib/dates'
import type { FieldDefinition } from '@/trackers/definition'
import { FIELD_REGISTRY } from '@/trackers/fields/registry'
import { pagesLabel, sessionLabel, type PlanItem } from '@/trackers/plan'
import type { Cell, Table } from './files'

export type ExportRetry = { label: string; due_date: string; status: string }

export type ExportEntry = {
  id: string
  date: string
  createdAt: string
  updatedAt: string
  data: Readonly<Record<string, unknown>>
  plan: PlanItem | null
  retries: ExportRetry[]
  comments: Comment[]
}

export type ExportTracker = {
  name: string
  cadence: 'plan' | 'daily'
  /** Every field the tracker has had, newest version's first. */
  fields: FieldDefinition[]
  entries: ExportEntry[]
}

/** "2026-11-10 20:15": a timestamp in New York, sortable, for a spreadsheet. */
export function stamp(timestamp: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}

/**
 * Every field across a tracker's versions, keyed once: the newest definition of each,
 * in the newest order, then fields only older versions had.
 */
export function allFields(
  versions: readonly { field_version: number; fields: FieldDefinition[] }[],
) {
  const seen = new Map<string, FieldDefinition>()
  for (const version of [...versions].sort((a, b) => b.field_version - a.field_version)) {
    for (const field of version.fields) if (!seen.has(field.key)) seen.set(field.key, field)
  }
  return [...seen.values()]
}

/** A field's answer as a cell: numbers stay numbers, everything else reads as on screen. */
export function answerCell(field: FieldDefinition, value: unknown): Cell {
  if (value === undefined || value === null) return null
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  try {
    const text = FIELD_REGISTRY[field.type].summary(value, field)
    return text === '' ? null : text
  } catch {
    return Array.isArray(value) ? value.join(', ') : JSON.stringify(value)
  }
}

const pages = (plan: PlanItem | null) => {
  const label = plan ? pagesLabel(plan.details) : null
  return label ? label.replace(/^Pages? /, '') : null
}

/** Columns with nothing in any row are left out, so a tracker without pages has no Pages. */
function trim(table: Table, keep: ReadonlySet<string>): Table {
  const used = table.header.map(
    (name, col) => keep.has(name) || table.rows.some((row) => row[col] !== null && row[col] !== ''),
  )
  return {
    name: table.name,
    header: table.header.filter((_, col) => used[col]),
    rows: table.rows.map((row) => row.filter((_, col) => used[col])),
  }
}

/** One tracker's logs, oldest first. */
export function trackerTable(tracker: ExportTracker): Table {
  const plan = tracker.cadence === 'plan'
  const header = [
    'Date',
    ...(plan ? ['Planned for', 'Session', 'Pages'] : []),
    ...tracker.fields.map((f) => f.label),
    'Retries',
    'Comments',
    'Logged',
    'Last changed',
  ]
  const rows = [...tracker.entries]
    .sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt < b.createdAt ? -1 : 1,
    )
    .map((entry): Cell[] => [
      entry.date,
      ...(plan
        ? [
            entry.plan?.date ?? null,
            entry.plan ? (sessionLabel(entry.plan.details) ?? entry.plan.title) : null,
            pages(entry.plan),
          ]
        : []),
      ...tracker.fields.map((field) => answerCell(field, entry.data[field.key])),
      entry.retries.length > 0
        ? entry.retries.map((r) => `${r.label} (${r.status})`).join('; ')
        : null,
      entry.comments.length,
      stamp(entry.createdAt),
      entry.updatedAt !== entry.createdAt ? stamp(entry.updatedAt) : null,
    ])
  return trim({ name: tracker.name, header, rows }, new Set(['Date', 'Comments', 'Logged']))
}

const from = (entry: ExportEntry) =>
  entry.plan ? `${sessionLabel(entry.plan.details) ?? entry.plan.title}, ${entry.date}` : entry.date

/** Every retry, by due date. */
export function retriesTable(trackers: readonly ExportTracker[]): Table {
  const rows = trackers
    .flatMap((tracker) =>
      tracker.entries.flatMap((entry) =>
        entry.retries.map((retry): Cell[] => [
          tracker.name,
          retry.label,
          from(entry),
          retry.due_date,
          retry.status,
        ]),
      ),
    )
    .sort((a, b) => String(a[3]).localeCompare(String(b[3])))
  return { name: 'Retries', header: ['Tracker', 'Problem', 'From', 'Due', 'Status'], rows }
}

/** Every comment, oldest first. */
export function commentsTable(trackers: readonly ExportTracker[]): Table {
  const rows = trackers
    .flatMap((tracker) =>
      tracker.entries.flatMap((entry) =>
        entry.comments.map((c): Cell[] => [
          stamp(c.createdAt),
          c.author ?? 'Someone',
          tracker.name,
          from(entry),
          c.body,
          c.editedAt ? stamp(c.editedAt) : null,
        ]),
      ),
    )
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  return {
    name: 'Comments',
    header: ['Written', 'By', 'Tracker', 'On', 'Comment', 'Edited'],
    rows,
  }
}

/** A file name: "Sam practice 2026-11-12.xlsx", without characters a file system refuses. */
export function fileName(parts: readonly string[], extension: string): string {
  return `${parts
    .join(' ')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()}.${extension}`
}
