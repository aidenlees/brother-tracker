import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { isSubmitKey } from '@/trackers/fields/contract'
import { withSpareRow, type Retry } from './retries'

/**
 * Which problems to retry: one label per line ("p. 31 #4"). Enter on a filled line goes
 * to the next one; Enter on an empty line moves on. All are due on one date, which
 * defaults to two days after the session.
 */
export function RetryStep({
  baseId,
  rows,
  onRows,
  due,
  onDue,
  hint,
  labelId,
  describedBy,
  onSubmit,
}: {
  baseId: string
  rows: Retry[]
  onRows: (rows: Retry[]) => void
  due: string
  onDue: (due: string) => void
  hint: string
  labelId: string
  describedBy?: string
  onSubmit: () => void
}) {
  const inputId = (index: number) => `${baseId}-retry-${index}`
  const focus = (index: number) => {
    // The spare row already exists: it appeared with the first letter typed above it.
    document.getElementById(inputId(index))?.focus()
  }

  return (
    <div className="flex flex-col gap-4">
      <ol aria-labelledby={labelId} aria-describedby={describedBy} className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <li key={row.id} className="flex items-center gap-2">
            <span className="w-6 text-right text-small text-muted-foreground tabular-nums">
              {index + 1}.
            </span>
            <Input
              id={inputId(index)}
              value={row.label}
              autoFocus={index === 0}
              autoComplete="off"
              placeholder={index === 0 ? hint : undefined}
              aria-label={`Retry ${index + 1}`}
              onChange={(e) => {
                const next = rows.map((r) =>
                  r.id === row.id ? { ...r, label: e.target.value } : r,
                )
                onRows(withSpareRow(next, due))
              }}
              onKeyDown={(e) => {
                if (!isSubmitKey(e)) return
                e.preventDefault()
                if (row.label.trim() === '') onSubmit()
                else focus(index + 1)
              }}
            />
            {row.label.trim() !== '' ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove retry ${row.label}`}
                onClick={() => {
                  onRows(
                    withSpareRow(
                      rows.filter((r) => r.id !== row.id),
                      due,
                    ),
                  )
                }}
              >
                <X aria-hidden />
              </Button>
            ) : (
              <span className="size-10" aria-hidden />
            )}
          </li>
        ))}
      </ol>
      <label className="flex items-center gap-3 text-muted-foreground">
        Due
        <Input
          type="date"
          value={due}
          onChange={(e) => {
            if (e.target.value) onDue(e.target.value)
          }}
          className="h-10 w-auto"
        />
      </label>
    </div>
  )
}
