import { defineFieldType, whole, type FieldProps } from './contract'
import { NumberBox } from './controls'

/** Whole minutes, 0 to 1440 (one day). */
export default defineFieldType<number>({
  schema: () => whole(0, 1440, 'must be whole minutes between 0 and 1440'),
  empty: () => null,
  summary: (value) => `${value} min`,
  Renderer: Duration,
})

function Duration({ field, placeholder, ...props }: FieldProps<number>) {
  return <NumberBox suffix="minutes" placeholder={placeholder ?? field.placeholder} {...props} />
}
