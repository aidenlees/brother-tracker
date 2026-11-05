import { z } from 'zod'
import { Textarea } from '@/components/ui/textarea'
import { characters, defineFieldType, isSubmitKey, type FieldProps } from './contract'

const MAX = 5000

/**
 * A few sentences, up to 5000 characters. Enter moves on and Shift+Enter starts a new
 * line, so a one-line answer never needs the mouse.
 */
export default defineFieldType<string>({
  schema: () =>
    z
      .string({ error: 'must be text' })
      .refine((v) => characters(v) <= MAX, `must be ${MAX} characters or fewer`),
  empty: () => '',
  summary: (value) => value,
  Renderer: LongText,
})

function LongText({
  field,
  value,
  onChange,
  labelId,
  describedBy,
  invalid,
  autoFocus,
  onSubmit,
  placeholder,
}: FieldProps<string>) {
  return (
    <Textarea
      value={value ?? ''}
      onChange={(e) => {
        onChange(e.target.value)
      }}
      onKeyDown={(e) => {
        if (onSubmit && isSubmitKey(e)) {
          e.preventDefault()
          onSubmit()
        }
      }}
      onFocus={(e) => {
        // A prefilled answer: put the caret at the end, ready to add to it.
        const end = e.target.value.length
        e.target.setSelectionRange(end, end)
      }}
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      autoFocus={autoFocus}
      placeholder={placeholder ?? field.placeholder}
    />
  )
}
