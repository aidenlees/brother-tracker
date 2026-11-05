import { z } from 'zod'
import { defineFieldType, optionKeys, optionLabel, type FieldProps } from './contract'
import { ChoiceRow } from './controls'

const MESSAGE = 'must be one of the options'

/** Exactly one of the field's options. */
export default defineFieldType<string>({
  schema: (field) => {
    const keys = optionKeys(field)
    return z.string({ error: MESSAGE }).refine((v) => keys.includes(v), MESSAGE)
  },
  empty: () => null,
  summary: (value, field) => optionLabel(field, value),
  Renderer: Select,
})

function Select({ field, value, onChange, labelId, describedBy, autoFocus }: FieldProps<string>) {
  const options = field.options ?? []
  const focusKey = value ?? options[0]?.key
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="flex flex-col gap-2">
      {options.map((option) => (
        <ChoiceRow
          key={option.key}
          type="radio"
          name={labelId}
          checked={value === option.key}
          onToggle={() => {
            onChange(option.key)
          }}
          label={option.label}
          autoFocus={autoFocus && option.key === focusKey}
          describedBy={describedBy}
        />
      ))}
    </div>
  )
}
