import { z } from 'zod'
import { defineFieldType, optionKeys, optionLabel, type FieldProps } from './contract'
import { ChoiceRow } from './controls'

/** Any of the field's options, each at most once. An empty list is an answer. */
export default defineFieldType<string[]>({
  schema: (field) => {
    const keys = optionKeys(field)
    return z
      .array(z.unknown(), { error: 'must be a list of options' })
      .refine(
        (v) => v.every((x) => typeof x === 'string' && keys.includes(x)),
        "must use only the field's options",
      )
      .refine((v) => new Set(v).size === v.length, 'lists an option twice') as z.ZodType<string[]>
  },
  empty: () => [],
  summary: (value, field) => value.map((key) => optionLabel(field, key)).join(', '),
  Renderer: MultiSelect,
})

function MultiSelect({
  field,
  value,
  onChange,
  labelId,
  describedBy,
  autoFocus,
}: FieldProps<string[]>) {
  const chosen = value ?? []
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
      {(field.options ?? []).map((option, index) => (
        <ChoiceRow
          key={option.key}
          type="checkbox"
          name={`${labelId}-${option.key}`}
          checked={chosen.includes(option.key)}
          onToggle={(on) => {
            // Keep the field's option order, whatever order they were ticked in.
            const next = new Set(chosen)
            if (on) next.add(option.key)
            else next.delete(option.key)
            onChange(optionKeys(field).filter((key) => next.has(key)))
          }}
          label={option.label}
          autoFocus={autoFocus && index === 0}
          describedBy={describedBy}
        />
      ))}
    </div>
  )
}
