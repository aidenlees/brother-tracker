import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { formatDay } from '@/lib/dates'
import { isEditable, type EntryView } from '@/lib/outbox/overlay'
import type { Assignment } from '@/lib/student-data'
import { itemsOn, nextItem, pageLabel, sessionLabel, type PlanItem } from '@/trackers/plan'
import { logPath } from '../log/paths'
import { SavedNote } from './TrackerCard'

/** A plan-cadence tracker: today's session (or the next one), and whether it's logged. */
export function PlanCard({
  assignment,
  items,
  entries,
  today,
}: {
  assignment: Assignment
  items: PlanItem[]
  entries: EntryView[]
  today: string
}) {
  const todays = itemsOn(items, today)
  const next = nextItem(items, today)
  const entryFor = (item: PlanItem) => entries.find((e) => e.plan_item_id === item.id)

  if (todays.length > 0) {
    return (
      <div className="flex flex-col gap-6">
        {todays.map((item) => (
          <Session
            key={item.id}
            item={item}
            entry={entryFor(item)}
            href={logPath(assignment.id, { planItemId: item.id })}
          />
        ))}
      </div>
    )
  }

  const before = today < assignment.start_date
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground">
        {before
          ? `Starts ${formatDay(assignment.start_date, 'long')}.`
          : next
            ? 'No session today.'
            : 'That’s every session in the plan.'}
      </p>
      {next ? (
        <div className="flex flex-col gap-1 border-l-2 border-border pl-4">
          <p className="text-sm text-muted-foreground">
            {before ? 'First' : 'Next'}: {formatDay(next.date, 'long')}
          </p>
          <ItemText item={next} />
        </div>
      ) : null}
    </div>
  )
}

function ItemText({ item }: { item: PlanItem }) {
  const session = sessionLabel(item.details)
  const pages = pageLabel(item.details)
  return (
    <div className="flex flex-col gap-1">
      {session ? <p className="text-sm text-muted-foreground">{session}</p> : null}
      <p className="text-xl leading-snug text-foreground">{item.title}</p>
      {pages ? <p className="text-muted-foreground tabular-nums">{pages}</p> : null}
    </div>
  )
}

function Session({ item, entry, href }: { item: PlanItem; entry?: EntryView; href: string }) {
  return (
    <div className="flex flex-col gap-4">
      <ItemText item={item} />
      {entry ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SavedNote sync={entry.sync} reason={entry.reason} />
          {isEditable(entry) ? (
            <Button asChild variant="link" size="sm" className="h-auto px-0">
              <Link to={href}>Edit</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <Button asChild size="lg" className="self-start">
          <Link to={href}>
            Log this session
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      )}
    </div>
  )
}
