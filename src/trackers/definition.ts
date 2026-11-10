/**
 * The shape of a tracker definition (seed/trackers.json today, the tracker builder
 * later) and of a plan file (seed/math_sessions.json). Imported by both the app and
 * Node scripts, so it uses relative imports only.
 */
import { z } from 'zod'
import { TRACKER_ACCENTS } from '../theme/accents.ts'

/** Every field type in the registry. Each has a public.field_check_<type> SQL check. */
export const FIELD_TYPES = [
  'number',
  'counter',
  'tally_group',
  'checkbox',
  'checklist',
  'select',
  'multi_select',
  'short_text',
  'long_text',
  'duration',
  'rating_1_5',
  'page_range',
  'yes_no',
  'photo',
  'plan_checklist',
] as const
export type FieldTypeName = (typeof FIELD_TYPES)[number]

export const METRIC_TYPES = [
  'sum',
  'avg',
  'count_where',
  'ratio',
  'streak',
  'days_per_week',
] as const

const key = z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'keys are letters, digits and underscores')

/** `plan.<detail>`: reads a key from the plan item's details (e.g. plan.reading_only). */
const planRef = z
  .string()
  .regex(/^plan\.[a-z][a-z0-9_]*$/, 'plan references look like plan.<detail>')

export const FieldOption = z.strictObject({
  key,
  label: z.string().min(1),
  shortcut: z.string().length(1).optional(),
})

export const FieldDefinition = z.strictObject({
  key,
  type: z.enum(FIELD_TYPES),
  label: z.string().min(1),
  required: z.boolean(),
  help: z.string().optional(),
  placeholder: z.string().optional(),
  options: z.array(FieldOption).optional(),
  /** Bounds for `number` fields, as public.field_check_number reads them. */
  min: z.number().optional(),
  max: z.number().optional(),
  /** Show the field only when every key matches. `plan.<detail>` reads the plan item. */
  showIf: z.record(z.string(), z.union([z.boolean(), z.string(), z.number()])).optional(),
  rotatingPrompts: z.array(z.string().min(1)).optional(),
  rotateBy: z.string().optional(),
  /** Prefills a new entry from the plan item, e.g. "plan.assignment". The student can edit it. */
  default: planRef.optional(),
  /**
   * A plan_checklist's items, read from the plan item ("plan.problems"). The field is
   * hidden on a plan item whose list is missing or empty.
   */
  optionsFrom: planRef.optional(),
})
export type FieldDefinition = z.infer<typeof FieldDefinition>

/** A plan item's details (session, kind, reading_only, pages...), or null for daily entries. */
export type PlanDetails = Readonly<Record<string, unknown>> | null

/** Metric rules are evaluated by the metric engine (Phase 3); stored as given. */
export const MetricDefinition = z.looseObject({
  key,
  type: z.enum(METRIC_TYPES),
  label: z.string().min(1),
})
export type MetricDefinition = z.infer<typeof MetricDefinition>

/**
 * When a pacing flag is on (src/trackers/metrics/flags.ts reads it), for the week shown:
 *   week_below              a metric's value for the week is below `value`
 *   last_sessions_at_least  each of the last `sessions` sessions has a ratio metric at `value` or more
 *   missed_sessions         `atLeast` past sessions have no log
 */
export const PacingRule = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('week_below'), metric: key, value: z.number() }),
  z.strictObject({
    type: z.literal('last_sessions_at_least'),
    metric: key,
    sessions: z.int().min(1),
    value: z.number(),
  }),
  z.strictObject({ type: z.literal('missed_sessions'), atLeast: z.int().min(1) }),
])
export type PacingRule = z.infer<typeof PacingRule>

/** Shown to the admin only: never to students or viewers. */
export const PacingFlag = z.strictObject({
  key,
  label: z.string().min(1),
  when: PacingRule,
  audience: z.literal('admin'),
})
export type PacingFlag = z.infer<typeof PacingFlag>

export const FollowupRules = z.strictObject({
  /** A plan_checklist field: each item checked in it becomes a followup with that label. */
  from: key,
  defaultDueDays: z.int().min(0),
  /**
   * On plan items matching every key (any of the listed values), Today lists every
   * open followup, not just the ones due. Review sessions use this.
   */
  listAllOpenWhen: z
    .record(planRef, z.array(z.union([z.string(), z.number(), z.boolean()])).min(1))
    .optional(),
})
export type FollowupRules = z.infer<typeof FollowupRules>

export const TrackerDefinition = z
  .strictObject({
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    name: z.string().min(1).max(60),
    icon: z.string().regex(/^[a-z0-9-]+$/),
    color: z.enum(TRACKER_ACCENTS),
    sort: z.int(),
    cadence: z.discriminatedUnion('type', [
      z.strictObject({
        type: z.literal('plan'),
        /** The seed file its plan template comes from; none when the admin adds every item (tasks). */
        plan_source: z
          .string()
          .regex(/^seed\/[\w-]+\.json$/)
          .optional(),
      }),
      z.strictObject({ type: z.literal('daily') }),
    ]),
    field_version: z.int().min(1),
    /**
     * inline_on_today_card: a daily check-in logged on its Today card.
     * task_list: plan items the admin adds one by one (Tasks), each ticked off on Today.
     */
    display: z.enum(['inline_on_today_card', 'task_list']).optional(),
    fields: z.array(FieldDefinition).min(1),
    metrics: z.array(MetricDefinition),
    followups: FollowupRules.optional(),
    pacingFlags: z.array(PacingFlag).optional(),
  })
  .refine(
    (t) => t.fields.every((f) => (f.type === 'plan_checklist') === (f.optionsFrom !== undefined)),
    {
      message: 'a plan_checklist field needs optionsFrom, and only it can have one',
      path: ['fields'],
    },
  )
  .refine(
    (t) =>
      !t.followups ||
      t.fields.some((f) => f.key === t.followups?.from && f.type === 'plan_checklist'),
    {
      message: 'followups.from must name one of the tracker’s plan_checklist fields',
      path: ['followups'],
    },
  )
export type TrackerDefinition = z.infer<typeof TrackerDefinition>

export const TrackersFile = z.strictObject({
  _note: z.string().optional(),
  trackers: z.array(TrackerDefinition).min(1),
})

const isoDate = z.iso.date()

/** "p. 31 #4", or a lettered part, "p. 15 #2(e)". */
export const PROBLEM_LABEL = /^p\. \d+ #\d+(\([a-z]\))?$/

export const PlanSession = z.strictObject({
  session: z.int().min(1),
  week: z.int().min(1),
  date: isoDate,
  weekday: z.enum(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']),
  topic: z.string().min(1),
  assignment: z.string().min(1),
  page_start: z.int().nullable(),
  page_end: z.int().nullable(),
  kind: z.enum(['study', 'practice', 'review', 'mixed_check']),
  reading_only: z.boolean(),
  /**
   * The problems to do, one per problem or lettered part, named by the page they're
   * printed on ("p. 31 #4", "p. 15 #2(e)"). The math log lists them as checkboxes.
   */
  problems: z
    .array(z.string().regex(PROBLEM_LABEL, 'problems look like "p. 31 #4" or "p. 15 #2(e)"'))
    .min(1)
    .refine((labels) => new Set(labels).size === labels.length, 'each problem is listed once')
    .optional(),
})
export type PlanSession = z.infer<typeof PlanSession>

export const PlanFile = z.strictObject({
  tracker: z.string(),
  source: z.string().optional(),
  page_note: z.string().optional(),
  /** PDF viewer page = printed page + pdf_offset. Copied into each item that has pages. */
  pdf_offset: z.int().optional(),
  sessions: z.array(PlanSession).min(1),
})
export type PlanFile = z.infer<typeof PlanFile>
