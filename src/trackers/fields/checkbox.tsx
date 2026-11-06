import { z } from 'zod'
import { defineFieldType, type FieldProps } from './contract'
import { ChoiceRow } from './controls'

/** A single tick box. Unticked is an answer (false), not a blank. */
export default defineFieldType<boolean>({
  schema: () => z.boolean({ error: 'must be checked or unchecked' }),
  empty: () => false,
  summary: (value) => (value ? 'Yes' : 'No'),
  Renderer: Checkbox,
})

function Checkbox({
  field,
  value,
  onChange,
  labelId,
  describedBy,
  autoFocus,
}: FieldProps<boolean>) {
  return (
    <div role="group" aria-labelledby={labelId}>
      <ChoiceRow
        type="checkbox"
        name={labelId}
        checked={value ?? false}
        onToggle={onChange}
        label={field.help ?? field.label}
        autoFocus={autoFocus}
        describedBy={describedBy}
      />
    </div>
  )
}
