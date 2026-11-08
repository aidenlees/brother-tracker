import { ArrowRight, Check } from 'lucide-react'
import { Link } from 'react-router'
import { PageThumbnails } from '@/components/BookPages'
import { Button } from '@/components/ui/button'
import { formatDay } from '@/lib/dates'
import { isEditable, type EntryView } from '@/lib/outbox/overlay'
import type { Draft } from '@/lib/outbox/types'
import type { Assignment } from '@/lib/student-data'
import { bookPages, itemsOn, nextItem, workLabel, type PlanItem } from '@/trackers/plan'
import { logPath, sessionPath } from '../log/paths'
import { SavedNote } from './TrackerCard'

/**
 * A plan-cadence tracker: what today's session asks for, stated plainly ("Pages 31–32"),
 * ready to log. Once it's saved, one line says what comes next, with a way to log it
 * early; on a day without a session, or before the plan starts, that line is the card.
 * Sessions already logged ahead of their day are listed, and Next skips them.
 */
export function PlanCard({
  assignment,
  slug,
  items,
  entries,
  drafts,
  savedId,
  today,
}: {
  assignment: Assignment
  /** The tracker's slug, which names its book's pages. */
  slug: string
  items: PlanItem[]
  entries: EntryView[]
  /** Logs in progress on this device. */
  drafts: Draft[]
  /** The entry the log flow just saved, so its check mark eases in. */
  savedId?: string
  today: string
}) {
  const todays = itemsOn(items, today)
  const entryFor = (item: PlanItem) => entries.find((e) => e.plan_item_id === item.id)
  const next = nextItem(
    items.filter((item) => entryFor(item) === undefined),
    today,
  )
  const ahead = itemsAhead(items, today).filter((item) => entryFor(item) !== undefined)
  // An early log is dated today, and entries start on the plan's first day (the
  // database's rule), so before then there's no early log to offer.
  const started = today >= assignment.start_date
  const upNext = (label: string) =>
    next ? (
      <UpNext
        label={label}
        item={next}
        href={sessionPath(assignment.id, next.id)}
        logHref={started ? logPath(assignment.id, { planItemId: next.id }) : null}
        inProgress={drafts.some((d) => d.planItemId === next.id)}
      />
    ) : null

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
            pagesHref={sessionPath(assignment.id, item.id)}
            slug={slug}
          />
        ))}
        {allLogged ? (
          <div className="flex flex-col gap-2">
            <Ahead items={ahead} assignmentId={assignment.id} />
            {upNext('Next') ?? (
              <p className="text-muted-foreground">That was the last session in the plan.</p>
            )}
          </div>
        ) : null}
      </div>
    )
  }

  if (today < assignment.start_date && next && ahead.length === 0) return upNext('First session')
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground">
        {next ? 'No session today.' : 'That’s every session in the plan.'}
      </p>
      <Ahead items={ahead} assignmentId={assignment.id} />
      {upNext('Next')}
    </div>
  )
}

/** Future sessions, in plan order. */
function itemsAhead(items: readonly PlanItem[], today: string): PlanItem[] {
  return items
    .filter((item) => item.date > today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.sort - b.sort))
}

/** "Logged early: Monday, November 9 · Pages 14–19", for each session done ahead of its day. */
function Ahead({ items, assignmentId }: { items: PlanItem[]; assignmentId: string }) {
  if (items.length === 0) return null
  return (
    <ul className="flex flex-col gap-1 text-small">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            to={sessionPath(assignmentId, item.id)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <Check aria-hidden className="size-4 text-tracker" />
            <span>
              <span className="text-foreground">Logged early:</span> {formatDay(item.date, 'long')}{' '}
              · <span className="tabular-nums">{workLabel(item)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/**
 * "Next: Monday, November 9 · Pages 14–19", opening that session's pages, and logging it
 * early for a student who has done it already (once the plan has started).
 */
function UpNext({
  label,
  item,
  href,
  logHref,
  inProgress,
}: {
  label: string
  item: PlanItem
  href: string
  logHref: string | null
  inProgress: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <Link to={href} className="text-small text-muted-foreground hover:text-foreground">
        <span className="font-medium text-foreground">{label}:</span> {formatDay(item.date, 'long')}{' '}
        · <span className="tabular-nums">{workLabel(item)}</span>
      </Link>
      {logHref ? (
        <Button asChild variant="link" size="sm" className="h-auto px-0">
          <Link to={logHref}>{inProgress ? 'Resume logging it' : 'Done it early? Log it'}</Link>
        </Button>
      ) : null}
    </div>
  )
}

function Session({
  item,
  entry,
  inProgress,
  fresh,
  href,
  pagesHref,
  slug,
}: {
  item: PlanItem
  entry?: EntryView
  inProgress: boolean
  fresh: boolean
  href: string
  /** The session's page, with its pages from the book. */
  pagesHref: string
  slug: string
}) {
  return (
    <div className="flex flex-col gap-4">
      <Link
        to={pagesHref}
        className="self-start text-lead font-medium text-foreground tabular-nums underline-offset-4 hover:underline"
      >
        {workLabel(item)}
      </Link>
      <PageThumbnails slug={slug} pages={bookPages(item.details)} href={pagesHref} />
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
