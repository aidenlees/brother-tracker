import { z } from 'zod'
import { defineFieldType, isRecord, optionKeys, type FieldProps } from './contract'
import { ChoiceRow } from './controls'

export type Checklist = Record<string, boolean>

/** Several tick boxes. Each option is true or false; an unticked list is still an answer. */
export default defineFieldType<Checklist>({
  schema: (field) => {
    const keys = optionKeys(field)
    return z
      .custom<Checklist>(isRecord, { message: 'must be a checklist' })
      .superRefine((v, ctx) => {
        for (const [key, checked] of Object.entries(v)) {
          if (!keys.includes(key)) {
            ctx.addIssue({ code: 'custom', message: `has no item "${key}"` })
            return
          }
          if (typeof checked !== 'boolean') {
            ctx.addIssue({ code: 'custom', message: 'items must be checked or unchecked' })
            return
          }
        }
      })
  },
  empty: (field) => Object.fromEntries(optionKeys(field).map((key) => [key, false])),
  summary: (value, field) => {
    const keys = optionKeys(field)
    const done = keys.filter((key) => value[key]).length
    return `${done} of ${keys.length}`
  },
  Renderer: ChecklistField,
})

function ChecklistField({
  field,
  value,
  onChange,
  labelId,
  describedBy,
  autoFocus,
}: FieldProps<Checklist>) {
  const checked = value ?? {}
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
      {(field.options ?? []).map((option, index) => (
        <ChoiceRow
          key={option.key}
          type="checkbox"
          name={`${labelId}-${option.key}`}
          checked={checked[option.key] ?? false}
          onToggle={(next) => {
            onChange({ ...checked, [option.key]: next })
          }}
          label={option.label}
          autoFocus={autoFocus && index === 0}
          describedBy={describedBy}
        />
      ))}
    </div>
  )
}
