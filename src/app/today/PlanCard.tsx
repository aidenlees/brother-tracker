import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { formatDay } from '@/lib/dates'
import { isEditable, type EntryView } from '@/lib/outbox/overlay'
import type { Draft } from '@/lib/outbox/types'
import type { Assignment } from '@/lib/student-data'
import { cn } from '@/lib/utils'
import { itemsOn, nextItem, pageLabel, sessionLabel, type PlanItem } from '@/trackers/plan'
import { logPath } from '../log/paths'
import { SavedNote } from './TrackerCard'

/**
 * A plan-cadence tracker: today's session, ready to log. Once it's saved, the next one
 * shows below it, so the student always knows what comes after; on a day without a
 * session, or before the plan starts, the next one is what the card shows.
 */
export function PlanCard({
  assignment,
  items,
  entries,
  drafts,
  savedId,
  today,
}: {
  assignment: Assignment
  items: PlanItem[]
  entries: EntryView[]
  /** Logs in progress on this device. */
  drafts: Draft[]
  /** The entry the log flow just saved, so its check mark eases in. */
  savedId?: string
  today: string
}) {
  const todays = itemsOn(items, today)
  const next = nextItem(items, today)
  const entryFor = (item: PlanItem) => entries.find((e) => e.plan_item_id === item.id)

  if (todays.length > 0) {
    const allLogged = todays.every((item) => entryFor(item) !== undefined)
    return (
      <div className="flex flex-col gap-6">
        {todays.map((item) => (
          <Session
            key={item.id}
            item={item}
            entry={entryFor(item)}
            inProgress={drafts.some((d) => d.planItemId === item.id)}
            fresh={savedId !== undefined && entryFor(item)?.id === savedId}
            href={logPath(assignment.id, { planItemId: item.id })}
          />
        ))}
        {allLogged ? (
          next ? (
            <UpNext label={`Next: ${formatDay(next.date, 'long')}`} item={next} />
          ) : (
            <p className="text-muted-foreground">That was the last session in the plan.</p>
          )
        ) : null}
      </div>
    )
  }

  if (today < assignment.start_date && next) {
    return <UpNext label={`First session: ${formatDay(next.date, 'long')}`} item={next} />
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">
        {next ? 'No session today.' : 'That’s every session in the plan.'}
      </p>
      {next ? <UpNext label={`Next: ${formatDay(next.date, 'long')}`} item={next} /> : null}
    </div>
  )
}

/** A session's place in the plan, what to do, and its pages. */
function ItemText({ item, size }: { item: PlanItem; size: 'lead' | 'body' }) {
  const session = sessionLabel(item.details)
  const pages = pageLabel(item.details)
  return (
    <div className="flex flex-col gap-1">
      {session ? <p className="text-small text-muted-foreground">{session}</p> : null}
      <p className={cn('text-foreground', size === 'lead' ? 'text-lead' : 'text-body')}>
        {item.title}
      </p>
      {pages ? <p className="text-small text-muted-foreground tabular-nums">{pages}</p> : null}
    </div>
  )
}

/** The session after today's, set off by a rule in the margin. */
function UpNext({ label, item }: { label: string; item: PlanItem }) {
  return (
    <section aria-label={label} className="flex flex-col gap-2 border-l-2 border-border pl-4">
      <p className="text-small font-medium text-foreground">{label}</p>
      <ItemText item={item} size="body" />
    </section>
  )
}

function Session({
  item,
  entry,
  inProgress,
  fresh,
  href,
}: {
  item: PlanItem
  entry?: EntryView
  inProgress: boolean
  fresh: boolean
  href: string
}) {
  return (
    <div className="flex flex-col gap-4">
      <ItemText item={item} size="lead" />
      {entry ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SavedNote sync={entry.sync} reason={entry.reason} fresh={fresh} />
          {isEditable(entry) ? (
            <Button asChild variant="link" size="sm" className="h-auto px-0">
              <Link to={href}>{inProgress ? 'Resume editing' : 'Edit'}</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <Button asChild size="lg" className="self-start">
          <Link to={href}>
            {inProgress ? 'Resume logging' : 'Log this session'}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      )}
    </div>
  )
}
