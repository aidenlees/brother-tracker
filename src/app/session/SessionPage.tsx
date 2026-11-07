import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Link, useParams } from 'react-router'
import { PageImages } from '@/components/BookPages'
import { EmptyNote, Page } from '@/components/Page'
import { Button } from '@/components/ui/button'
import { formatDay } from '@/lib/dates'
import { useOutbox } from '@/lib/outbox/outbox-context'
import { isEditable } from '@/lib/outbox/overlay'
import { useDrafts } from '@/lib/outbox/use-drafts'
import { useStudentData } from '@/lib/student-data'
import { useToday } from '@/lib/use-today'
import { groupItems } from '@/trackers/fields/plan_checklist'
import { bookPages, topicLabel, workLabel } from '@/trackers/plan'
import { logPath } from '../log/paths'
import { SavedNote } from '../today/TrackerCard'

/**
 * One planned session: what it is, when, the book's pages for it (large, from the
 * private bucket), and logging it. Reached from Today and My week, for any day, so the
 * pages of a coming session can be seen ahead of time.
 */
export function SessionPage() {
  const { assignmentId, planItemId } = useParams()
  const today = useToday()
  const data = useStudentData()
  const drafts = useDrafts(useOutbox().userId)

  if (data.status === 'loading') {
    return (
      <p role="status" className="text-muted-foreground">
        Loading…
      </p>
    )
  }
  const assignment = data.assignments.find((a) => a.id === assignmentId)
  const item = data.planItems.find((i) => i.id === planItemId && i.assignment_id === assignmentId)
  const tracker = assignment?.tracker
  if (data.status === 'error' || !assignment || !tracker || !item) {
    return (
      <Page title="Session">
        <EmptyNote>
          {data.status === 'error'
            ? 'Couldn’t load your plan. Check your connection, then reload.'
            : 'This session isn’t one of yours.'}
        </EmptyNote>
        <Link to="/week" className="text-foreground underline underline-offset-4">
          Back to My week
        </Link>
      </Page>
    )
  }

  const entry = data.entries.find((e) => e.plan_item_id === item.id)
  const inProgress = drafts.some((d) => d.planItemId === item.id)
  const href = logPath(assignment.id, { planItemId: item.id })
  const problems = Array.isArray(item.details.problems)
    ? item.details.problems.filter((p): p is string => typeof p === 'string')
    : []
  const future = item.date > today

  return (
    <div style={{ '--tracker': `var(--tracker-${tracker.color})` } as CSSProperties}>
      <Page
        title={topicLabel(item.details) ?? item.title}
        lead={`${tracker.name} · ${formatDay(item.date, 'long')} · ${workLabel(item)}`}
        back={
          <nav aria-label="Back" className="flex gap-4 text-small">
            <Link
              to="/today"
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft aria-hidden className="size-4" />
              Today
            </Link>
            <Link to="/week" className="text-muted-foreground hover:text-foreground">
              My week
            </Link>
          </nav>
        }
      >
        {entry ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <SavedNote sync={entry.sync} reason={entry.reason} />
            {isEditable(entry) ? (
              <Button asChild variant="link" size="sm" className="h-auto px-0">
                <Link to={href}>{inProgress ? 'Resume editing' : 'Edit'}</Link>
              </Button>
            ) : null}
          </div>
        ) : future ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-muted-foreground">Planned for {formatDay(item.date, 'long')}.</p>
            <Button asChild variant="link" size="sm" className="h-auto px-0">
              <Link to={href}>Done it early? Log it</Link>
            </Button>
          </div>
        ) : (
          <Button asChild size="lg" className="self-start">
            <Link to={href}>
              {inProgress ? 'Resume logging' : 'Log this session'}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        )}

        {problems.length > 0 ? (
          <section aria-labelledby="problems" className="flex flex-col gap-2">
            <h2 id="problems" className="text-body text-foreground">
              Problems
            </h2>
            <ul className="flex flex-col gap-1 text-small text-muted-foreground tabular-nums">
              {groupItems(problems).map((group) => (
                <li key={group.name ?? ''}>
                  {group.name ? <span className="text-foreground">{group.name}: </span> : null}
                  {group.rows
                    .map((row) =>
                      row.name
                        ? `${row.name} ${row.items.map((i) => i.text).join(' ')}`
                        : row.items.map((i) => i.text).join(', '),
                    )
                    .join(', ')}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <PageImages slug={tracker.slug} pages={bookPages(item.details)} />
      </Page>
    </div>
  )
}
