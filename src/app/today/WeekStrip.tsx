import { Check, Minus } from 'lucide-react'
import { Link } from 'react-router'
import { formatDay } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { Day, DayState } from '@/trackers/week'
import { logPath } from '../log/paths'

/** What a day's mark means, read out with its date. */
const SPOKEN: Record<'daily' | 'plan', Record<DayState, string>> = {
  daily: {
    done: 'Done',
    'not-done': 'Logged, not done',
    open: 'Not logged',
    rest: 'No entry needed',
    before: 'before the start',
  },
  plan: {
    done: 'Session logged',
    'not-done': 'Session logged',
    open: 'Session not logged',
    rest: 'No session',
    before: 'before the start',
  },
}

/**
 * The last 7 days at the foot of a Today card, oldest on the left, as a practice record:
 * a box and a mark per day, and
 * above it the streak in plain words when the tracker keeps one. Tap a day to log it
 * late or change it (entries lock 7 days after logging, and then open read-only).
 */
export function WeekStrip({
  assignmentId,
  cadence,
  days,
  line,
  today,
}: {
  assignmentId: string
  cadence: 'daily' | 'plan'
  days: Day[]
  /** The streak sentence, if any. */
  line: string | null
  today: string
}) {
  return (
    <nav aria-label="Last 7 days" className="flex flex-col gap-3 border-t border-border pt-6">
      {line ? <p className="text-small text-foreground">{line}</p> : null}
      {/* A practice record: seven joined boxes, one per day, like the chart a teacher hands out. */}
      <ol className="grid grid-cols-7 divide-x divide-border overflow-hidden rounded-md border border-border">
        {days.map((day) => {
          const weekday = formatDay(day.date).slice(0, 3)
          const isToday = day.date === today
          const cell = (
            <span className="flex flex-col items-center gap-2 pt-2 pb-3">
              <span
                className={cn(
                  'border-b-2 px-0.5 text-caption',
                  isToday
                    ? 'border-tracker font-medium text-foreground'
                    : 'border-transparent text-muted-foreground',
                )}
              >
                {weekday}
              </span>
              <Mark state={day.state} />
            </span>
          )
          const label = `${formatDay(day.date, 'long')}: ${SPOKEN[cadence][day.state]}`
          const href =
            day.state === 'before' || day.state === 'rest'
              ? null
              : cadence === 'plan'
                ? day.planItemId
                  ? logPath(assignmentId, { planItemId: day.planItemId })
                  : null
                : logPath(assignmentId, { date: day.date })
          return (
            <li key={day.date} className={cn(day.state === 'before' && 'bg-muted/40')}>
              {href ? (
                <Link
                  to={href}
                  aria-label={label}
                  aria-current={isToday ? 'date' : undefined}
                  className="block transition-colors hover:bg-muted focus-visible:-outline-offset-2"
                >
                  {cell}
                </Link>
              ) : (
                <span role="img" aria-label={label} className="block">
                  {cell}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/** A pen tick for done, a dash for logged-not-done, an empty box to fill in, a dot for a day off. */
function Mark({ state }: { state: DayState }) {
  switch (state) {
    case 'done':
      return (
        <span className="flex size-6 items-center justify-center text-tracker">
          <Check aria-hidden className="size-6" strokeWidth={3} />
        </span>
      )
    case 'not-done':
      return (
        <span className="flex size-6 items-center justify-center text-muted-foreground">
          <Minus aria-hidden className="size-5" strokeWidth={2.5} />
        </span>
      )
    case 'open':
      return <span className="m-0.5 size-5 rounded-sm border border-dashed border-input" />
    case 'rest':
    case 'before':
      return (
        <span className="flex size-6 items-center justify-center">
          <span
            className={cn('size-1.5 rounded-full bg-border', state === 'before' && 'opacity-50')}
          />
        </span>
      )
  }
}
