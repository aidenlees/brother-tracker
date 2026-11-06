/**
 * Plan items as the student sees them: which one is today's, which is next, which were
 * missed, and how their pages read. Every rule here reads the item's details, never a
 * tracker slug, so any plan-cadence tracker gets the same behaviour.
 */

export type PlanItem = {
  id: string
  assignment_id: string
  date: string
  title: string
  details: Readonly<Record<string, unknown>>
  sort: number
}

const whole = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) ? value : null

/**
 * "pp. 31–32 · PDF 33–34": the printed pages and, when the item carries a pdf_offset,
 * the pages to open in the PDF viewer. Null when the item has no pages.
 */
export function pageLabel(details: PlanItem['details']): string | null {
  const start = whole(details.page_start)
  const end = whole(details.page_end) ?? start
  if (start === null || end === null) return null
  const span = (a: number, b: number) => (a === b ? `p. ${a}` : `pp. ${a}–${b}`)
  const offset = whole(details.pdf_offset)
  const printed = span(start, end)
  if (offset === null || offset === 0) return printed
  const pdf = start === end ? `PDF ${start + offset}` : `PDF ${start + offset}–${end + offset}`
  return `${printed} · ${pdf}`
}

/** "Session 6 · Solve by Assuming", from whichever of session and topic the item has. */
export function sessionLabel(details: PlanItem['details']): string | null {
  const session = whole(details.session)
  const topic = typeof details.topic === 'string' && details.topic.trim() ? details.topic : null
  const parts = [session === null ? null : `Session ${session}`, topic].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

const byDate = (a: PlanItem, b: PlanItem) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : a.sort - b.sort

/** This assignment's items dated today (usually one). */
export function itemsOn(items: readonly PlanItem[], date: string): PlanItem[] {
  return items.filter((item) => item.date === date).sort(byDate)
}

/** The first item after today, or null when the plan is finished. */
export function nextItem(items: readonly PlanItem[], today: string): PlanItem | null {
  return [...items].sort(byDate).find((item) => item.date > today) ?? null
}

/** Past items with no entry yet, oldest first: sessions to log late (or to do late). */
export function missedItems(
  items: readonly PlanItem[],
  loggedItemIds: ReadonlySet<string>,
  today: string,
): PlanItem[] {
  return items.filter((item) => item.date < today && !loggedItemIds.has(item.id)).sort(byDate)
}
