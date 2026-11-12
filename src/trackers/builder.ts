/**
 * The tracker builder's rules (CLAUDE.md, "Tracker builder"): a draft the admin edits,
 * turned into a tracker definition the app and the database already understand. Pure,
 * so Vitest checks every rule. The screen is src/app/builder/.
 *
 * - A new tracker starts from a blank (the default questions `did` and `struggled`) or a
 *   copy of an existing one.
 * - Keys come from labels and never change once a question exists: logs are keyed by
 *   them. Editing the questions bumps field_version in the database (trackers_version).
 * - Weekly numbers are offered from the questions (a yes/no gives days and a streak, a
 *   number a total and an average), so no one writes a metric rule by hand.
 */
import { TRACKER_ACCENTS, type TrackerAccent } from '@/theme/accents'
import {
  FieldDefinition,
  MetricDefinition,
  TrackerDefinition,
  type FieldTypeName,
} from './definition'

/** The question types the builder offers, in its words. plan_checklist reads a plan item, so only plan trackers have it. */
export const QUESTION_TYPES: { type: FieldTypeName; label: string; hint: string }[] = [
  { type: 'yes_no', label: 'Yes or no', hint: 'Two big buttons.' },
  { type: 'short_text', label: 'A short answer', hint: 'One line.' },
  { type: 'long_text', label: 'A longer answer', hint: 'A few sentences.' },
  { type: 'number', label: 'A number', hint: 'Typed in.' },
  { type: 'duration', label: 'Minutes', hint: 'How long it took.' },
  { type: 'counter', label: 'A count', hint: 'Tapped up and down.' },
  { type: 'rating_1_5', label: 'A rating, 1 to 5', hint: 'Five buttons.' },
  { type: 'select', label: 'Pick one', hint: 'From choices you list.' },
  { type: 'multi_select', label: 'Pick any', hint: 'From choices you list.' },
  { type: 'checklist', label: 'A checklist', hint: 'Items to tick.' },
  { type: 'checkbox', label: 'A tick box', hint: 'Done or not.' },
  { type: 'page_range', label: 'Pages', hint: 'From one page to another.' },
  { type: 'photo', label: 'A photo', hint: 'Taken or chosen on the device.' },
]

/** Only a plan tracker's sessions list problems, so only it can ask about them. */
export const PLAN_QUESTION = {
  type: 'plan_checklist',
  label: 'The session’s problems',
  hint: 'A box for each problem the session lists: which were hard?',
} as const

/** The question types a draft can use: the plan's problems only on a plan tracker. */
export function questionTypes(draft: Pick<Draft, 'cadence'>) {
  return draft.cadence.type === 'plan' ? [...QUESTION_TYPES, PLAN_QUESTION] : QUESTION_TYPES
}

/** A made-up session for the preview of a plan tracker, so its problem boxes show. */
export const SAMPLE_SESSION = {
  session: 1,
  topic: 'A sample session',
  page_start: 12,
  page_end: 13,
  problems: ['p. 12 #1', 'p. 12 #2', 'p. 13 #3'],
} as const

/** Types whose question lists choices. */
export const WITH_OPTIONS: ReadonlySet<FieldTypeName> = new Set([
  'select',
  'multi_select',
  'checklist',
  'tally_group',
])

export const ACCENT_NAMES: Record<TrackerAccent, string> = {
  'ink-blue': 'Ink blue',
  'rosin-amber': 'Rosin amber',
  moss: 'Moss',
  plum: 'Plum',
  teal: 'Teal',
  brick: 'Brick',
}

export type Draft = {
  /** The tracker's id once it exists. */
  id: string | null
  slug: string
  name: string
  icon: string
  color: TrackerAccent
  cadence: TrackerDefinition['cadence']
  display?: TrackerDefinition['display']
  fields: FieldDefinition[]
  metrics: MetricDefinition[]
  followups?: TrackerDefinition['followups']
  pacingFlags?: TrackerDefinition['pacingFlags']
  sort: number
  /** Keys of questions already saved: they keep their key (logs are keyed by it). */
  savedKeys: readonly string[]
}

/** "Reading log" → "reading-log". */
export function slugFrom(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
}

/** A key for a new question from its label, unique among `taken`: "Pages read?" → "pages_read". */
export function keyFrom(label: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const base =
    label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32)
      .replace(/^[^a-z]+/, '')
      .replace(/_+$/g, '') || 'question'
  let key = base
  for (let n = 2; used.has(key); n += 1) key = `${base}_${String(n)}`
  return key
}

/** The defaults every new tracker starts with (CLAUDE.md, "Metric types"). */
export function defaultFields(): FieldDefinition[] {
  return [
    { key: 'did', type: 'short_text', label: 'What did you do?', required: true },
    {
      key: 'struggled',
      type: 'short_text',
      label: 'What did you struggle with?',
      required: false,
      help: 'Leave it empty if nothing.',
    },
  ]
}

export function blankDraft(name: string, sort: number): Draft {
  return {
    id: null,
    slug: slugFrom(name),
    name,
    icon: 'circle',
    color: 'moss',
    cadence: { type: 'daily' },
    display: undefined,
    fields: defaultFields(),
    metrics: [],
    followups: undefined,
    pacingFlags: undefined,
    sort,
    savedKeys: [],
  }
}

/** A tracker as a draft: to edit it (keep its id), or to start a new one from a copy. */
export function draftFrom(
  tracker: Omit<Draft, 'savedKeys' | 'id'> & { id: string },
  copy?: { name: string; sort: number },
): Draft {
  if (!copy) return { ...tracker, savedKeys: tracker.fields.map((f) => f.key) }
  // A copy is daily and has no plan, retries or pacing flags of its own: those belong
  // to a plan, and a new tracker has none.
  const fields = tracker.fields.filter((f) => f.type !== 'plan_checklist' && !f.optionsFrom)
  return {
    ...tracker,
    id: null,
    slug: slugFrom(copy.name),
    name: copy.name,
    cadence: { type: 'daily' },
    display: tracker.display === 'task_list' ? undefined : tracker.display,
    fields: fields.map((f) => {
      const own: FieldDefinition = { ...f }
      delete own.default
      if (own.showIf && Object.keys(own.showIf).some((k) => k.startsWith('plan.'))) {
        delete own.showIf
      }
      return own
    }),
    metrics: tracker.metrics.filter((m) => !JSON.stringify(m).includes('plan.')),
    followups: undefined,
    pacingFlags: undefined,
    sort: copy.sort,
    savedKeys: [],
  }
}

/** A new question of a type, keyed from its label among the draft's questions. */
export function newQuestion(type: FieldTypeName, label: string, draft: Draft): FieldDefinition {
  const key = keyFrom(
    label,
    draft.fields.map((f) => f.key),
  )
  if (type === 'plan_checklist') {
    return { key, type, label, required: false, optionsFrom: 'plan.problems' }
  }
  const field: FieldDefinition = { key, type, label, required: type !== 'photo' }
  if (WITH_OPTIONS.has(type)) {
    field.options = [
      { key: 'first', label: 'First choice' },
      { key: 'second', label: 'Second choice' },
    ]
  }
  return field
}

/** Choices from one label per line, keyed like questions. */
export function optionsFrom(lines: string): NonNullable<FieldDefinition['options']> {
  const taken: string[] = []
  return lines
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((label) => {
      const key = keyFrom(label, taken)
      taken.push(key)
      return { key, label }
    })
}

/** Moves the question at `from` to `to`, keeping the rest in order. */
export function move<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || to < 0 || to >= list.length) return [...list]
  const next = [...list]
  const [item] = next.splice(from, 1)
  if (item !== undefined) next.splice(to, 0, item)
  return next
}

/**
 * Removes a question, and whatever leaned on it: a later question shown only when it
 * was answered, and numbers counted from it.
 */
export function removeQuestion(draft: Draft, key: string): Draft {
  const leans = (m: MetricDefinition) =>
    m.field === key || (typeof m.where === 'string' && m.where.split(/\s+or\s+/).includes(key))
  return {
    ...draft,
    fields: draft.fields
      .filter((f) => f.key !== key)
      .map((f) => {
        if (!f.showIf || !(key in f.showIf)) return f
        const rest = Object.fromEntries(Object.entries(f.showIf).filter(([k]) => k !== key))
        const next: FieldDefinition = { ...f, showIf: rest }
        if (Object.keys(rest).length === 0) delete next.showIf
        return next
      }),
    metrics: draft.metrics.filter((m) => !leans(m) && !JSON.stringify(m).includes(`(${key})`)),
    followups: draft.followups?.from === key ? undefined : draft.followups,
  }
}

export type Suggestion = { metric: MetricDefinition; why: string }

/** Weekly numbers the questions allow, that the draft doesn't have yet. */
export function suggestMetrics(draft: Draft): Suggestion[] {
  const have = new Set(draft.metrics.map((m) => JSON.stringify({ ...m, key: '', label: '' })))
  const keys = new Set(draft.metrics.map((m) => m.key))
  const out: Suggestion[] = []
  const add = (metric: MetricDefinition, why: string) => {
    if (have.has(JSON.stringify({ ...metric, key: '', label: '' }))) return
    const key = keyFrom(metric.key, keys)
    keys.add(key)
    out.push({ metric: { ...metric, key }, why })
  }
  const daily = draft.cadence.type === 'daily'
  for (const f of draft.fields) {
    if (f.type === 'yes_no' || f.type === 'checkbox') {
      if (daily) {
        add(
          { key: `${f.key}_days`, type: 'days_per_week', label: 'Days', where: f.key },
          `days answered yes to “${f.label}”`,
        )
        add(
          { key: `${f.key}_streak`, type: 'streak', label: 'Streak', where: f.key },
          `days in a row of “${f.label}”`,
        )
      } else {
        add(
          {
            key: `${f.key}_week`,
            type: 'count_where',
            label: 'Sessions done',
            where: f.key,
            period: 'week',
          },
          `logs that answered yes to “${f.label}”`,
        )
      }
    }
    if (f.type === 'number' || f.type === 'duration' || f.type === 'counter') {
      add(
        {
          key: `${f.key}_total`,
          type: 'sum',
          label: f.type === 'duration' ? 'Minutes' : `Total ${f.label.toLowerCase()}`,
          field: f.key,
          period: 'week',
        },
        `“${f.label}” added up over the week`,
      )
    }
    if (f.type === 'plan_checklist' && !daily) {
      add(
        {
          key: `${f.key}_rate`,
          type: 'ratio',
          label: 'Solved on my own',
          numerator: `count(plan.problems) - count(${f.key})`,
          denominator: 'count(plan.problems)',
          format: 'percent',
          nullWhen: 'denominator = 0',
        },
        `the share of the session’s problems not ticked in “${f.label}”`,
      )
    }
    if (f.type === 'rating_1_5' || f.type === 'number') {
      add(
        {
          key: `${f.key}_average`,
          type: 'avg',
          label: `Average ${f.label.toLowerCase()}`,
          field: f.key,
          period: 'week',
        },
        `the week’s average of “${f.label}”`,
      )
    }
  }
  return out
}

export type DraftIssue = { where: string; message: string }

/**
 * The draft as a tracker definition, or what's wrong with it in words. Judged by the
 * same schema the seed file uses, plus the builder's own rules (unique keys, choices).
 */
export function toDefinition(
  draft: Draft,
  fieldVersion: number,
): { ok: true; definition: TrackerDefinition } | { ok: false; issues: DraftIssue[] } {
  const issues: DraftIssue[] = []
  if (!draft.name.trim()) issues.push({ where: 'Name', message: 'Give the tracker a name.' })
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(draft.slug)) {
    issues.push({ where: 'Name', message: 'The name needs at least one letter or digit.' })
  }
  if (draft.fields.length === 0) {
    issues.push({ where: 'Questions', message: 'Ask at least one question.' })
  }
  const keys = new Set<string>()
  draft.fields.forEach((f, i) => {
    const where = `Question ${String(i + 1)}`
    if (!f.label.trim()) issues.push({ where, message: 'Write the question.' })
    if (keys.has(f.key)) issues.push({ where, message: 'Two questions share a key.' })
    keys.add(f.key)
    if (WITH_OPTIONS.has(f.type) && (f.options?.length ?? 0) < 1) {
      issues.push({ where, message: 'List at least one choice.' })
    }
    if (f.type === 'number' && f.min !== undefined && f.max !== undefined && f.min > f.max) {
      issues.push({ where, message: 'The smallest number is above the largest.' })
    }
  })
  draft.metrics.forEach((m, i) => {
    if (!m.label.trim()) {
      issues.push({ where: `Number ${String(i + 1)}`, message: 'Name the number.' })
    }
  })
  if (issues.length > 0) return { ok: false, issues }

  const parsed = TrackerDefinition.safeParse({
    slug: draft.slug,
    name: draft.name.trim(),
    icon: draft.icon,
    color: draft.color,
    sort: draft.sort,
    cadence: draft.cadence,
    field_version: fieldVersion,
    ...(draft.display ? { display: draft.display } : {}),
    fields: draft.fields.map((f) => FieldDefinition.parse(stripEmpty(f))),
    metrics: draft.metrics.map((m) => MetricDefinition.parse(m)),
    ...(draft.followups ? { followups: draft.followups } : {}),
    ...(draft.pacingFlags ? { pacingFlags: draft.pacingFlags } : {}),
  })
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        where: i.path.join(' ') || 'Tracker',
        message: i.message,
      })),
    }
  }
  return { ok: true, definition: parsed.data }
}

/** Drops empty optional parts (a help left blank), which the schema would refuse. */
function stripEmpty(field: FieldDefinition): FieldDefinition {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(field as Record<string, unknown>)) {
    if (v === undefined || v === '') continue
    if (Array.isArray(v) && v.length === 0 && k !== 'options') continue
    out[k] = v
  }
  return out as FieldDefinition
}

export const isAccent = (value: string): value is TrackerAccent =>
  (TRACKER_ACCENTS as readonly string[]).includes(value)
