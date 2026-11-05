/**
 * What every field type implements (CLAUDE.md, "Field types"): a renderer, a Zod
 * schema, an empty value and a summary formatter. The fifth part, the SQL check, is
 * public.field_check_<type> in the migrations. Adding a type = one file in this folder,
 * one line in registry.ts, and one SQL check.
 */
import type { ComponentType } from 'react'
import { z } from 'zod'
import type { FieldDefinition } from '../definition'

/** What every renderer receives. `value` is null until the student answers. */
export type FieldProps<V> = {
  field: FieldDefinition
  value: V | null
  onChange: (next: V | null) => void
  /** id of the element holding the field's label: every control is aria-labelledby it. */
  labelId: string
  /** id of the help or error text, for aria-describedby. */
  describedBy?: string
  invalid?: boolean
  autoFocus?: boolean
  /** Enter in a single-line control (or plain Enter in long text): move on. */
  onSubmit?: () => void
  /** The field fills the screen (one log step), so its keyboard shortcuts listen globally. */
  hotkeys?: boolean
  /** Overrides field.placeholder, e.g. with the session's reflection prompt. */
  placeholder?: string
}

export type FieldType<V> = {
  /** Accepts exactly what public.field_check_<type> accepts for a value that is present. */
  schema: (field: FieldDefinition) => z.ZodType<V>
  /** The value a new entry starts with, before any plan default. */
  empty: (field: FieldDefinition) => V | null
  /** Plain text for lists, reviews and export. */
  summary: (value: V, field: FieldDefinition) => string
  Renderer: ComponentType<FieldProps<V>>
}

/** Registers a type; the registry stores them without their value types. */
export function defineFieldType<V>(type: FieldType<V>): FieldType<unknown> {
  return type as unknown as FieldType<unknown>
}

// Shared pieces of the SQL checks ---------------------------------------------------

/** Postgres char_length counts characters (code points), not UTF-16 units. */
export function characters(text: string): number {
  return Array.from(text).length
}

/** public.field_is_whole: a JSON number with no fraction, within the bounds. */
export function whole(min: number | null, max: number | null, message: string) {
  return z.custom<number>(
    (value) =>
      typeof value === 'number' &&
      Number.isFinite(value) &&
      Number.isInteger(value) &&
      (min === null || value >= min) &&
      (max === null || value <= max),
    { message },
  )
}

/** public.field_option_keys */
export function optionKeys(field: FieldDefinition): string[] {
  return (field.options ?? []).map((o) => o.key)
}

export function optionLabel(field: FieldDefinition, key: string): string {
  return field.options?.find((o) => o.key === key)?.label ?? key
}

/** A plain JSON object (jsonb_typeof = 'object'), not an array or null. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** True when a key event belongs to a text control, so global shortcuts leave it alone. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement) return true
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit'].includes(target.type)
  }
  return false
}

/** Enter (without Shift, outside an IME composition) as "move on". */
export function isSubmitKey(event: {
  key: string
  shiftKey: boolean
  nativeEvent: { isComposing?: boolean }
}): boolean {
  return event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing
}
