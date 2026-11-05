import { z } from 'zod'
import { defineFieldType, type FieldProps } from './contract'
import { NumberBox } from './controls'

/** Any number, optionally bounded by the field's min and max. */
export default defineFieldType<number>({
  schema: (field) =>
    z
      .custom<number>((v) => typeof v === 'number' && Number.isFinite(v), {
        message: 'must be a number',
      })
      .refine((v) => field.min === undefined || v >= field.min, 'is below the minimum')
      .refine((v) => field.max === undefined || v <= field.max, 'is above the maximum'),
  empty: () => null,
  summary: (value) => String(value),
  Renderer: NumberField,
})

function NumberField({ field, placeholder, ...props }: FieldProps<number>) {
  return <NumberBox decimals placeholder={placeholder ?? field.placeholder} {...props} />
}
