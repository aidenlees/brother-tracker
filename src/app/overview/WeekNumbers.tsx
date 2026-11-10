import { ArrowLeft, ArrowRight, Flag } from 'lucide-react'
import { useId, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router'
import { EmptyNote } from '@/components/Page'
import { Button } from '@/components/ui/button'
import type { Student } from '@/lib/admin-logs'
import { addDays, formatDay, weekRange } from '@/lib/dates'
import { useStudentNumbers, type StudentTracker } from '@/lib/overview-numbers'
import { readMetrics, weekValue, type Metric } from '@/trackers/metrics/engine'
import { pacingHits } from '@/trackers/metrics/flags'
import { formatMetric } from '@/trackers/metrics/format'
import { TrackerIcon } from '@/trackers/TrackerIcon'

/**
 * A student's week on Overview: each tracker's numbers (CLAUDE.md, "Metric types") with
 * last week's beside them, the week's notes, and for the admin only, any pacing flag.
 * Any week back can be opened, to check one by hand.
 */
export function WeekNumbers({
  student,
  sunday,
  thisWeek,
  today,
  isAdmin,
  weekLink,
}: {
  student: Student
  sunday: string
  thisWeek: string
  today: string
  isAdmin: boolean
  weekLink: (sunday: string) => string
}) {
  const headingId = useId()
  const numbers = useStudentNumbers(student.id)
  const range = weekRange(sunday)

  let body: ReactNode
  if (numbers.status === 'pending') {
    body = (
      <p role="status" className="text-muted-foreground">
        Loading {student.name}’s numbers…
      </p>
    )
  } else if (numbers.status === 'error') {
    body = (
      <EmptyNote>
        Couldn’t load {student.name}’s numbers. Check your connection, then reload.
      </EmptyNote>
    )
  } else {
    const cards = numbers.data.flatMap((assignment) => {
      const card = trackerWeek(assignment, sunday, today, isAdmin)
      return card ? [card] : []
    })
    body =
      cards.length === 0 ? (
        <EmptyNote>{student.name}’s trackers have no numbers to show.</EmptyNote>
      ) : (
        <ul className="flex flex-col gap-4">
          {cards.map((card) => (
            <li key={card.assignmentId}>
              <TrackerWeek card={card} />
            </li>
          ))}
        </ul>
      )
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <h2 id={headingId} className="font-heading text-title text-foreground">
          {sunday === thisWeek ? `This week · ${range}` : `Week of ${range}`}
        </h2>
        <nav aria-label="Weeks" className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={weekLink(addDays(sunday, -7))}>
              <ArrowLeft aria-hidden />
              Previous week
            </Link>
          </Button>
          {sunday !== thisWeek ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to={weekLink(thisWeek)}>This week</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to={weekLink(addDays(sunday, 7))}>
                  Next week
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </>
          ) : null}
        </nav>
      </div>
      {body}
    </section>
  )
}

type Row = { key: string; label: string; value: string | null; last?: string | null }
type Note = { label: string; items: { date: string; text: string }[] }
type Card = {
  assignmentId: string
  name: string
  icon: string | null
  color: string | null
  rows: Row[]
  notes: Note[]
  flags: { key: string; label: string; detail: string }[]
  /** In place of the numbers: the tracker can't be read, or hadn't started that week. */
  message: string | null
}

/** One tracker's week, or null when it has nothing to show (no metrics, no notes). */
function trackerWeek(
  assignment: StudentTracker,
  sunday: string,
  today: string,
  isAdmin: boolean,
): Card | null {
  const { tracker } = assignment
  if (!tracker) {
    return {
      assignmentId: assignment.assignmentId,
      name: assignment.trackerName,
      icon: null,
      color: null,
      rows: [],
      notes: [],
      flags: [],
      message: 'This version of the app can’t show this tracker’s numbers.',
    }
  }
  const saturday = addDays(sunday, 6)
  if (assignment.startDate > saturday) {
    const metrics = readMetrics(tracker.metrics)
    if (metrics.length === 0) return null
    return {
      assignmentId: assignment.assignmentId,
      name: tracker.name,
      icon: tracker.icon,
      color: tracker.color,
      rows: [],
      notes: [],
      flags: [],
      message: `Starts ${formatDay(assignment.startDate, 'long')}.`,
    }
  }
  const metrics = readMetrics(tracker.metrics)
  const format = (metric: Metric, value: number) => formatMetric(metric, value, tracker.fields)
  const shown = (metric: Metric, week: string) => {
    const value = weekValue(metric, assignment.entries, week, today)
    return value === null ? null : format(metric, value)
  }
  const rows = metrics.map((metric) => ({
    key: metric.key,
    label: metric.label,
    value: shown(metric, sunday),
    // A streak runs across weeks: last week's isn't a comparison.
    ...(metric.type === 'streak' ? {} : { last: shown(metric, addDays(sunday, -7)) }),
  }))

  const week = assignment.entries
    .filter((e) => e.date >= sunday && e.date <= saturday)
    .toSorted((a, b) => a.date.localeCompare(b.date))
  const notes = tracker.fields
    .filter((field) => field.type === 'short_text')
    .map((field) => ({
      label: field.label,
      items: week.flatMap((e) => {
        const text = e.data[field.key]
        return typeof text === 'string' && text.trim() ? [{ date: e.date, text: text.trim() }] : []
      }),
    }))
    .filter((note) => note.items.length > 0)

  if (rows.length === 0 && notes.length === 0) return null
  return {
    assignmentId: assignment.assignmentId,
    name: tracker.name,
    icon: tracker.icon,
    color: tracker.color,
    rows,
    notes,
    flags: isAdmin
      ? pacingHits(assignment.flags, {
          metrics,
          entries: assignment.entries,
          items: assignment.items,
          startDate: assignment.startDate,
          sunday,
          today,
          format,
        })
      : [],
    message: null,
  }
}

/** A blank number: a dash to see, words to hear. Never 0. */
function Value({ value, none }: { value: string | null; none: string }) {
  return value === null ? (
    <>
      <span aria-hidden="true">–</span>
      <span className="sr-only">{none}</span>
    </>
  ) : (
    value
  )
}

function TrackerWeek({ card }: { card: Card }) {
  const headingId = useId()
  return (
    <article
      aria-labelledby={headingId}
      style={
        card.color ? ({ '--tracker': `var(--tracker-${card.color})` } as CSSProperties) : undefined
      }
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 sm:p-6"
    >
      <h3 id={headingId} className="flex items-center gap-2 text-body font-medium text-foreground">
        {card.icon ? (
          <TrackerIcon name={card.icon} className="size-4 shrink-0 text-tracker" />
        ) : null}
        {card.name}
      </h3>
      {card.message ? <p className="text-muted-foreground">{card.message}</p> : null}
      {card.rows.length > 0 ? (
        <dl className="flex flex-col divide-y divide-border">
          {card.rows.map((row) => (
            <div
              key={row.key}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
            >
              <dt className="text-foreground">{row.label}</dt>
              <dd className="flex items-baseline gap-3 tabular-nums">
                <span className="font-medium text-foreground">
                  <Value value={row.value} none="Nothing logged" />
                </span>
                {row.last !== undefined ? (
                  <span className="text-small text-muted-foreground">
                    Last week <Value value={row.last} none="nothing logged" />
                  </span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {card.notes.map((note) => (
        <div key={note.label} className="flex flex-col gap-2">
          <h4 className="text-small text-muted-foreground">{note.label}</h4>
          <ul className="flex flex-col gap-1">
            {note.items.map((item) => (
              <li key={item.date} className="flex gap-3">
                <span className="w-20 shrink-0 text-small text-muted-foreground tabular-nums">
                  {formatDay(item.date)}
                </span>
                <span className="text-foreground">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {card.flags.length > 0 ? (
        <ul aria-label="Pacing flags" className="flex flex-col gap-2 border-t border-border pt-4">
          {card.flags.map((flag) => (
            <li key={flag.key} className="flex gap-2 text-small text-foreground">
              <Flag aria-hidden className="mt-0.5 size-4 shrink-0 text-tracker" />
              <span>
                <span className="font-medium">{flag.label}.</span> {flag.detail}.
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  )
}
