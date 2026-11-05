/**
 * Entry data in the browser: what a new entry starts as, which fields show, and the
 * check that runs before an entry is queued (CLAUDE.md, "Validation").
 *
 * cleanEntry mirrors the public.entries_validate trigger rule for rule, in field order,
 * so anything it accepts the database stores unchanged (13_field_parity.sql proves it on
 * shared fixtures). If the two drifted apart, the offline outbox would hold entries the
 * server refuses. It is deliberately a little stricter in one place: whitespace-only
 * text counts as blank here, where SQL's btrim only strips spaces.
 */
import { z } from 'zod'
import type { FieldDefinition } from './definition'
import { FIELD_REGISTRY } from './fields/registry'

/** A plan item's details (session, kind, reading_only, pages...), or null for daily entries. */
export type PlanDetails = Readonly<Record<string, unknown>> | null
export type EntryData = Record<string, unknown>
export type EntryIssue = { key: string; message: string }
export type CleanResult = { ok: true; data: EntryData } | { ok: false; issues: EntryIssue[] }

const PLAN_PREFIX = 'plan.'

/** `plan.<detail>` from the plan item, or undefined (also when there is no plan item). */
export function planValue(ref: string, plan: PlanDetails): unknown {
  return ref.startsWith(PLAN_PREFIX) ? plan?.[ref.slice(PLAN_PREFIX.length)] : undefined
}

/**
 * showIf: every key must equal its value (SQL: `is not distinct from` on jsonb). A key
 * that is missing, null or an object never matches a condition's plain value.
 */
export function isShown(field: FieldDefinition, data: EntryData, plan: PlanDetails): boolean {
  return shownIn(field, new Map(Object.entries(data)), plan)
}

function shownIn(field: FieldDefinition, data: Map<string, unknown>, plan: PlanDetails): boolean {
  return Object.entries(field.showIf ?? {}).every(([key, expected]) => {
    const actual = key.startsWith(PLAN_PREFIX) ? planValue(key, plan) : data.get(key)
    return actual === expected
  })
}

/** Missing, null, or text with nothing but whitespace. */
export function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
}

/** The fields to show for the data so far, in order, as cleanEntry will judge them. */
export function shownFields(
  fields: readonly FieldDefinition[],
  data: EntryData,
  plan: PlanDetails,
): FieldDefinition[] {
  const working = new Map(Object.entries(data))
  return fields.filter((field) => {
    const shown = shownIn(field, working, plan)
    if (!shown || isBlank(working.get(field.key))) working.delete(field.key)
    return shown
  })
}

/** Checks and tidies entry data exactly as public.entries_validate does. */
export function cleanEntry(
  fields: readonly FieldDefinition[],
  raw: EntryData,
  plan: PlanDetails,
): CleanResult {
  // SQL strips hidden and blank fields as it walks the list, and later showIf
  // conditions see the stripped data, so do the same on a working copy.
  const data = new Map(Object.entries(raw))
  const issues: EntryIssue[] = []
  for (const field of fields) {
    if (!shownIn(field, data, plan)) {
      data.delete(field.key)
      continue
    }
    const value = data.get(field.key)
    if (isBlank(value)) {
      if (field.required) issues.push({ key: field.key, message: `${field.label} is required` })
      data.delete(field.key)
      continue
    }
    const result = FIELD_REGISTRY[field.type].schema(field).safeParse(value)
    if (result.success) {
      data.set(field.key, result.data)
    } else {
      issues.push({
        key: field.key,
        message: `${field.label} ${result.error.issues[0]?.message ?? 'is not valid'}`,
      })
    }
  }
  const known = new Set(fields.map((f) => f.key))
  const unknown = [...data.keys()].filter((key) => !known.has(key))
  if (unknown.length > 0) {
    issues.push({
      key: unknown[0] ?? '',
      message: `This tracker has no field ${unknown.sort().join(', ')}`,
    })
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, data: Object.fromEntries(data) }
}

/** cleanEntry as a Zod schema, for callers that compose schemas. */
export function buildEntrySchema(fields: readonly FieldDefinition[], plan: PlanDetails) {
  return z.record(z.string(), z.unknown()).transform((raw, ctx) => {
    const result = cleanEntry(fields, raw, plan)
    if (result.ok) return result.data
    for (const issue of result.issues) {
      ctx.addIssue({ code: 'custom', path: [issue.key], message: issue.message })
    }
    return z.NEVER
  })
}

/** A new entry: each field's empty value, or its plan default ("plan.assignment"). */
export function initialData(fields: readonly FieldDefinition[], plan: PlanDetails): EntryData {
  return Object.fromEntries(
    fields.map((field) => {
      const fromPlan = field.default ? planValue(field.default, plan) : undefined
      const value = fromPlan ?? FIELD_REGISTRY[field.type].empty(field)
      return [field.key, value]
    }),
  )
}

/**
 * The prompt for a field with rotatingPrompts: one per session, in turn, read from the
 * plan detail named by rotateBy (e.g. plan.session, counted from 1).
 */
export function promptFor(field: FieldDefinition, plan: PlanDetails): string | undefined {
  const prompts = field.rotatingPrompts
  if (!prompts || prompts.length === 0) return field.placeholder
  const turn = field.rotateBy ? planValue(field.rotateBy, plan) : undefined
  const index = typeof turn === 'number' && Number.isInteger(turn) ? turn - 1 : 0
  return prompts[((index % prompts.length) + prompts.length) % prompts.length]
}
