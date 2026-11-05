import type { Draft } from '@/lib/outbox/types'

export type Retry = Draft['followups'][number]

/** Rows always end with one empty row, ready for the next label. */
export function withSpareRow(rows: Retry[], due: string): Retry[] {
  const last = rows.at(-1)
  return last && last.label.trim() === ''
    ? rows
    : [...rows, { id: crypto.randomUUID(), label: '', due_date: due }]
}
