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

/** "Pages 31–32", or "Page 35": the printed pages to work on. Null when the item has none. */
export function pagesLabel(details: PlanItem['details']): string | null {
  const start = whole(details.page_start)
  const end = whole(details.page_end) ?? start
  if (start === null || end === null) return null
  return start === end ? `Page ${String(start)}` : `Pages ${String(start)}–${String(end)}`
}

/**
 * What a session asks for, as plainly as the item allows: its pages; else the problems
 * it names (a mixed check: "p. 17 #4(c), p. 33 #8"); else its title.
 */
export function workLabel(item: Pick<PlanItem, 'title' | 'details'>): string {
  const pages = pagesLabel(item.details)
  if (pages) return pages
  const problems = item.details.problems
  if (Array.isArray(problems) && problems.length > 0) return problems.join(', ')
  return item.title
}

/**
 * The printed pages a session works on, to show from the book: its page range, or the
 * pages its problems name (a mixed check: "p. 17 #4(c), p. 33 #8" -> 17, 33).
 */
export function bookPages(details: PlanItem['details']): number[] {
  const start = whole(details.page_start)
  const end = whole(details.page_end) ?? start
  if (start !== null && end !== null && end >= start) {
    return Array.from({ length: end - start + 1 }, (_, i) => start + i)
  }
  const problems = Array.isArray(details.problems) ? details.problems : []
  const pages = problems.flatMap((label) => {
    const page = typeof label === 'string' ? /^p\. (\d+) /.exec(label)?.[1] : undefined
    return page ? [Number(page)] : []
  })
  return [...new Set(pages)].sort((a, b) => a - b)
}

/** The session's topic ("Solve by Assuming"), or null. */
export function topicLabel(details: PlanItem['details']): string | null {
  return typeof details.topic === 'string' && details.topic.trim() ? details.topic : null
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
