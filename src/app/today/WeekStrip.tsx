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
 * The last 7 days at the foot of a Today card, oldest on the left: a mark per day, and
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
      <ol className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const weekday = formatDay(day.date).slice(0, 3)
          const isToday = day.date === today
          const cell = (
            <span className="flex flex-col items-center gap-2 py-2">
              <span
                className={cn(
                  'text-caption',
                  isToday ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {weekday}
              </span>
              <Mark state={day.state} />
              <span
                aria-hidden
                className={cn('h-0.5 w-4 rounded-sm', isToday ? 'bg-tracker' : 'bg-transparent')}
              />
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
            <li key={day.date}>
              {href ? (
                <Link
                  to={href}
                  aria-label={label}
                  aria-current={isToday ? 'date' : undefined}
                  className="block rounded-md transition-colors hover:bg-muted"
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

/** Filled for done, a ring for a day still to log, a dot for a day off. */
function Mark({ state }: { state: DayState }) {
  switch (state) {
    case 'done':
      return (
        <span className="flex size-7 items-center justify-center rounded-full bg-tracker text-background">
          <Check aria-hidden className="size-4" strokeWidth={2.5} />
        </span>
      )
    case 'not-done':
      return (
        <span className="flex size-7 items-center justify-center rounded-full border border-input text-muted-foreground">
          <Minus aria-hidden className="size-4" />
        </span>
      )
    case 'open':
      return <span className="size-7 rounded-full border border-input" />
    case 'rest':
    case 'before':
      return (
        <span className="flex size-7 items-center justify-center">
          <span
            className={cn('size-1.5 rounded-full bg-border', state === 'before' && 'opacity-50')}
          />
        </span>
      )
  }
}
