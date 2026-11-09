import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router'
import { EmptyNote, Page } from '@/components/Page'
import { Button } from '@/components/ui/button'
import { addDays, formatDay } from '@/lib/dates'
import { useStudentData, type Assignment } from '@/lib/student-data'
import { useToday } from '@/lib/use-today'
import { cn } from '@/lib/utils'
import { topicLabel, workLabel } from '@/trackers/plan'
import { taskNotes } from '@/trackers/tasks'
import { dayRows, weekDates, weekStart, type Row, type Status } from '@/trackers/schedule'
import { TrackerIcon } from '@/trackers/TrackerIcon'
import { logPath, sessionPath } from '../log/paths'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** "November 8 – 14", or "October 25 – November 1" across a month. */
function rangeLabel(sunday: string): string {
  const saturday = addDays(sunday, 6)
  const month = (iso: string) =>
    new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long' }).format(
      new Date(`${iso}T00:00:00Z`),
    )
  const day = (iso: string) => String(Number(iso.slice(8)))
  return month(sunday) === month(saturday)
    ? `${month(sunday)} ${day(sunday)} – ${day(saturday)}`
    : `${month(sunday)} ${day(sunday)} – ${month(saturday)} ${day(saturday)}`
}

/**
 * My week answers one question: what's planned, day by day? Sunday to Saturday, with
 * the weeks before and after a tap away, so coming sessions (and their pages) can be
 * seen ahead. Counts and checks only: never a grade, never a pacing flag.
 */
export function WeekPage() {
  const today = useToday()
  const [search] = useSearchParams()
  const asked = search.get('week')
  const sunday = weekStart(asked && ISO_DATE.test(asked) ? asked : today)
  const thisWeek = weekStart(today)
  const data = useStudentData()

  const weekLink = (start: string) => (start === thisWeek ? '/week' : `/week?week=${start}`)

  return (
    <Page title="My week" lead={rangeLabel(sunday)}>
      <nav aria-label="Weeks" className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to={weekLink(addDays(sunday, -7))}>
            <ArrowLeft aria-hidden />
            Previous week
          </Link>
        </Button>
        {sunday !== thisWeek ? (
          <Button asChild variant="ghost" size="sm">
            <Link to="/week">This week</Link>
          </Button>
        ) : null}
        <Button asChild variant="outline" size="sm">
          <Link to={weekLink(addDays(sunday, 7))}>
            Next week
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </nav>

      {data.status === 'loading' ? (
        <p role="status" className="text-muted-foreground">
          Loading your plan…
        </p>
      ) : data.status === 'error' ? (
        <EmptyNote>Couldn’t load your plan. Check your connection, then reload.</EmptyNote>
      ) : data.assignments.length === 0 ? (
        <EmptyNote>Your plan will show up here once your admin assigns your trackers.</EmptyNote>
      ) : (
        <ol className="flex flex-col rounded-lg border border-border bg-card">
          {weekDates(sunday).map((date) => {
            const rows = data.assignments.flatMap((assignment) => {
              const tracker = assignment.tracker
              if (!tracker) return []
              const where = tracker.metrics.find((m) => m.type === 'streak')?.where
              return dayRows(
                {
                  id: assignment.id,
                  start_date: assignment.start_date,
                  cadence: tracker.cadence.type,
                  doneWhen: typeof where === 'string' ? where : undefined,
                },
                data.planItems.filter((i) => i.assignment_id === assignment.id),
                data.entries.filter((e) => e.assignment_id === assignment.id),
                date,
                today,
              )
                .filter((row) => row.status !== 'before')
                .map((row) => ({ row, assignment }))
            })
            return (
              <li
                key={date}
                aria-current={date === today ? 'date' : undefined}
                className="flex flex-col gap-3 border-b border-border p-5 last:border-b-0 sm:px-6"
              >
                <h2 className="flex items-baseline justify-between gap-3 text-body text-foreground">
                  <span>{formatDay(date, 'long')}</span>
                  {date === today ? (
                    <span className="text-small font-medium text-foreground">Today</span>
                  ) : null}
                </h2>
                {rows.length === 0 ? (
                  <p className="text-small text-muted-foreground">Nothing planned.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {rows.map(({ row, assignment }) => (
                      <ScheduleRow
                        key={row.kind === 'session' ? row.item.id : `${row.assignmentId}-${date}`}
                        row={row}
                        assignment={assignment}
                        today={today}
                      />
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </Page>
  )
}

const STATUS_TEXT: Record<Status, string | null> = {
  done: 'Done',
  'not-done': 'Logged',
  today: 'To do',
  missed: 'Not logged',
  coming: null,
  before: null,
}

function ScheduleRow({
  row,
  assignment,
  today,
}: {
  row: Row
  assignment: Assignment
  today: string
}) {
  const tracker = assignment.tracker
  if (!tracker) return null
  // A task is ticked off on Today: it has no session page or log flow to open.
  const task = tracker.display === 'task_list'
  const href =
    row.kind === 'session'
      ? task
        ? null
        : sessionPath(assignment.id, row.item.id)
      : row.date <= today
        ? logPath(assignment.id, { date: row.date })
        : null
  const text = task && row.status === 'missed' ? 'Still to do' : STATUS_TEXT[row.status]
  const detail =
    row.kind !== 'session'
      ? null
      : task
        ? [tracker.name, taskNotes(row.item.details)].filter(Boolean).join(' · ')
        : `${tracker.name} · ${topicLabel(row.item.details) ?? row.item.title}`
  const body = (
    <>
      <TrackerIcon name={tracker.icon} className="size-4 shrink-0 self-start mt-1 text-tracker" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium text-foreground tabular-nums">
          {row.kind === 'session' ? workLabel(row.item) : tracker.name}
        </span>
        {detail ? <span className="text-small text-muted-foreground">{detail}</span> : null}
      </span>
      {text ? (
        <span
          className={cn(
            'flex shrink-0 items-center gap-1 text-small',
            row.status === 'done' ? 'text-foreground' : 'text-muted-foreground',
            row.status === 'today' && 'font-medium text-foreground',
          )}
        >
          {row.status === 'done' ? <Check aria-hidden className="size-4 text-tracker" /> : null}
          {text}
        </span>
      ) : null}
    </>
  )
  const style = { '--tracker': `var(--tracker-${tracker.color})` } as CSSProperties
  return (
    <li style={style}>
      {href ? (
        <Link
          to={href}
          className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted"
        >
          {body}
        </Link>
      ) : (
        <span className="-mx-2 flex items-center gap-3 px-2 py-2">{body}</span>
      )}
    </li>
  )
}
