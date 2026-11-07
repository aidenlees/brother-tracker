import { ArrowRight } from 'lucide-react'
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
 * ready to log. Once it's saved, one line says what comes next; on a day without a
 * session, or before the plan starts, that line is the card.
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
            pagesHref={sessionPath(assignment.id, item.id)}
            slug={slug}
          />
        ))}
        {allLogged ? (
          next ? (
            <UpNext label="Next" item={next} href={sessionPath(assignment.id, next.id)} />
          ) : (
            <p className="text-muted-foreground">That was the last session in the plan.</p>
          )
        ) : null}
      </div>
    )
  }

  if (today < assignment.start_date && next) {
    return <UpNext label="First session" item={next} href={sessionPath(assignment.id, next.id)} />
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground">
        {next ? 'No session today.' : 'That’s every session in the plan.'}
      </p>
      {next ? <UpNext label="Next" item={next} href={sessionPath(assignment.id, next.id)} /> : null}
    </div>
  )
}

/** "Next: Sunday, November 8 · Pages 33–34", opening that session's pages. */
function UpNext({ label, item, href }: { label: string; item: PlanItem; href: string }) {
  return (
    <Link to={href} className="self-start text-small text-muted-foreground hover:text-foreground">
      <span className="font-medium text-foreground">{label}:</span> {formatDay(item.date, 'long')} ·{' '}
      <span className="tabular-nums">{workLabel(item)}</span>
    </Link>
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
