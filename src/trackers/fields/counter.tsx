import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { defineFieldType, whole, type FieldProps } from './contract'

/** A whole number from 0 up, with − and + buttons. */
export default defineFieldType<number>({
  schema: () => whole(0, null, 'must be a whole number, 0 or more'),
  empty: () => 0,
  summary: (value) => String(value),
  Renderer: Counter,
})

function Counter({ field, value, onChange, labelId, describedBy, autoFocus }: FieldProps<number>) {
  const count = value ?? 0
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      className="flex items-center gap-3"
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`One less ${field.label}`}
        disabled={count <= 0}
        onClick={() => {
          onChange(Math.max(0, count - 1))
        }}
      >
        <Minus aria-hidden />
      </Button>
      <output aria-live="polite" className="min-w-12 text-center text-title tabular-nums">
        {count}
      </output>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`One more ${field.label}`}
        autoFocus={autoFocus}
        onClick={() => {
          onChange(count + 1)
        }}
      >
        <Plus aria-hidden />
      </Button>
    </div>
  )
}
