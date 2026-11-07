import { ChevronDown } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { formatDay } from '@/lib/dates'
import type { Draft } from '@/lib/outbox/types'
import { workLabel, type PlanItem } from '@/trackers/plan'
import { logPath } from '../log/paths'

/**
 * Past sessions with no entry yet: a to-do, not a judgement (never "behind"; pacing
 * flags stay with the admin, CLAUDE.md). Folded under one line so today's session leads
 * the card and a gap after a break isn't a wall; opened, oldest first, each one a tap
 * from its log.
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
  const headingId = useId()
  if (items.length === 0) return null
  return (
    <section aria-labelledby={headingId} className="border-t border-border pt-6">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-foreground [&::-webkit-details-marker]:hidden">
          {/* Not a heading: a summary is a button, and a button's content is plain text. */}
          <span id={headingId}>
            {items.length === 1
              ? '1 earlier session to log'
              : `${items.length} earlier sessions to log`}
          </span>
          <ChevronDown
            aria-hidden
            className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
          />
        </summary>
        <ul className="mt-4 flex flex-col gap-4">
          {items.map((item) => {
            const inProgress = drafts.some((d) => d.planItemId === item.id)
            return (
              <li key={item.id} className="grid grid-cols-[1fr_auto] items-center gap-3">
                <span className="text-foreground">
                  {formatDay(item.date)}
                  <span className="text-muted-foreground"> · </span>
                  <span className="tabular-nums">{workLabel(item)}</span>
                </span>
                <Button asChild size="sm" variant="outline">
                  <Link
                    to={logPath(assignmentId, { planItemId: item.id })}
                    aria-label={`${inProgress ? 'Resume' : 'Log'} ${formatDay(item.date, 'long')}: ${workLabel(item)}`}
                  >
                    {inProgress ? 'Resume' : 'Log'}
                  </Link>
                </Button>
              </li>
            )
          })}
        </ul>
      </details>
    </section>
  )
}
