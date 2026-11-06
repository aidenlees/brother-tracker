import { z } from 'zod'
import { defineFieldType, isRecord, whole, type FieldProps } from './contract'
import { NumberBox } from './controls'

export type PageRange = { start?: number | null; end?: number | null }

const MESSAGE = 'must be a start and end page'
const page = whole(1, null, MESSAGE)

/** A first and last page, 1 or more, ending on or after the first. */
export default defineFieldType<PageRange>({
  schema: () =>
    z
      .custom<Record<string, unknown>>(isRecord, { message: MESSAGE })
      .pipe(z.object({ start: page, end: page }, { error: MESSAGE }))
      .refine((v) => v.end >= v.start, 'must end on or after its first page'),
  empty: () => null,
  summary: (value) =>
    value.start === value.end
      ? `p. ${value.start ?? ''}`
      : `pp. ${value.start ?? ''}–${value.end ?? ''}`,
  Renderer: PageRangeField,
})

function PageRangeField({
  value,
  onChange,
  labelId,
  describedBy,
  invalid,
  autoFocus,
  onSubmit,
}: FieldProps<PageRange>) {
  const range = value ?? {}
  const set = (part: 'start' | 'end', n: number | null) => {
    const next = { ...range, [part]: n }
    onChange(next.start == null && next.end == null ? null : next)
  }
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-wrap items-center gap-3">
      <span className="text-muted-foreground">From page</span>
      <NumberBox
        value={range.start ?? null}
        onChange={(n) => {
          set('start', n)
        }}
        labelId={labelId}
        describedBy={describedBy}
        invalid={invalid}
        autoFocus={autoFocus}
        onSubmit={onSubmit}
        className="w-24"
      />
      <span className="text-muted-foreground">to</span>
      <NumberBox
        value={range.end ?? null}
        onChange={(n) => {
          set('end', n)
        }}
        labelId={labelId}
        describedBy={describedBy}
        invalid={invalid}
        onSubmit={onSubmit}
        className="w-24"
      />
    </div>
  )
}
