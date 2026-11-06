import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { formatDay } from '@/lib/dates'
import type { Draft } from '@/lib/outbox/types'
import { sessionLabel, type PlanItem } from '@/trackers/plan'
import { logPath } from '../log/paths'

const SHOWN = 4

/**
 * Past sessions with no entry yet: a to-do, not a judgement (no counts, no "behind").
 * Pacing flags stay with the admin (CLAUDE.md). Oldest first; after four, the rest
 * fold away so a gap after a break isn't a wall.
 */
export function Missed({
  assignmentId,
  items,
  drafts,
}: {
  assignmentId: string
  items: PlanItem[]
  drafts: Draft[]
}) {
  if (items.length === 0) return null
  const row = (item: PlanItem) => {
    const session = sessionLabel(item.details)
    const inProgress = drafts.some((d) => d.planItemId === item.id)
    return (
      <li key={item.id} className="grid grid-cols-[1fr_auto] items-center gap-3">
        <span className="flex flex-col">
          <span className="text-small text-muted-foreground">
            {[formatDay(item.date), session].filter(Boolean).join(' · ')}
          </span>
          <span className="text-foreground">{item.title}</span>
        </span>
        <Button asChild size="sm" variant="outline">
          <Link
            to={logPath(assignmentId, { planItemId: item.id })}
            aria-label={`${inProgress ? 'Resume' : 'Log'} ${formatDay(item.date, 'long')}: ${item.title}`}
          >
            {inProgress ? 'Resume' : 'Log'}
          </Link>
        </Button>
      </li>
    )
  }
  const rest = items.slice(SHOWN)
  return (
    <section
      aria-label="Not logged yet"
      className="flex flex-col gap-3 border-t border-border pt-6"
    >
      <h3 className="text-body text-foreground">Not logged yet</h3>
      <ul className="flex flex-col gap-3">{items.slice(0, SHOWN).map(row)}</ul>
      {rest.length > 0 ? (
        <details className="flex flex-col gap-3">
          <summary className="cursor-pointer text-small text-muted-foreground hover:text-foreground">
            {rest.length === 1 ? '1 more' : `${rest.length} more`}
          </summary>
          <ul className="mt-3 flex flex-col gap-3">{rest.map(row)}</ul>
        </details>
      ) : null}
    </section>
  )
}
