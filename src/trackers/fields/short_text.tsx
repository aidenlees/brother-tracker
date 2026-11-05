import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { characters, defineFieldType, isSubmitKey, type FieldProps } from './contract'

const MAX = 200

/** One line of text, up to 200 characters. Enter moves on. */
export default defineFieldType<string>({
  schema: () =>
    z
      .string({ error: 'must be text' })
      .refine((v) => characters(v) <= MAX, `must be ${MAX} characters or fewer`),
  empty: () => '',
  summary: (value) => value,
  Renderer: ShortText,
})

function ShortText({
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
    <Input
      value={value ?? ''}
      onChange={(e) => {
        onChange(e.target.value)
      }}
      onKeyDown={(e) => {
        if (isSubmitKey(e)) {
          e.preventDefault()
          onSubmit?.()
        }
      }}
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      autoFocus={autoFocus}
      placeholder={placeholder ?? field.placeholder}
      autoComplete="off"
    />
  )
}
