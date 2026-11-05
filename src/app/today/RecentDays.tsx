import { Check, Minus } from 'lucide-react'
import { Link } from 'react-router'
import { addDays, formatDay } from '@/lib/dates'
import type { EntryView } from '@/lib/outbox/overlay'
import type { Tracker } from '@/lib/student-data'
import { cn } from '@/lib/utils'
import { logPath } from '../log/paths'

const DAYS = 7

/**
 * The last week of a daily tracker, oldest on the left: tap a day to log it late or
 * change it (within 7 days of logging; older entries open read-only). A day counts as
 * done when the tracker's streak rule says so (violin: practiced), else when logged.
 */
export function RecentDays({
  assignmentId,
  startDate,
  tracker,
  entries,
  today,
}: {
  assignmentId: string
  startDate: string
  tracker: Tracker
  entries: EntryView[]
  today: string
}) {
  const where = tracker.metrics.find((m) => m.type === 'streak')?.where
  const done = (entry: EntryView) => (typeof where === 'string' ? entry.data[where] === true : true)
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i - (DAYS - 1)))

  return (
    <nav aria-label="This week" className="border-t border-border pt-4">
      <ol className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const entry = entries.find((e) => e.date === day && e.plan_item_id === null)
          const state = !entry ? 'Not logged' : done(entry) ? 'Done' : 'Logged, not done'
          const weekday = formatDay(day).slice(0, 3)
          const cell = (
            <span
              className={cn(
                'flex h-14 flex-col items-center justify-center gap-1 rounded-md border text-xs',
                entry && done(entry)
                  ? 'border-tracker text-foreground'
                  : 'border-input text-muted-foreground',
                day === today && 'font-medium',
              )}
            >
              <span>{weekday}</span>
              {entry ? (
                done(entry) ? (
                  <Check aria-hidden className="size-4 text-tracker" />
                ) : (
                  <Minus aria-hidden className="size-4" />
                )
              ) : (
                <span aria-hidden className="size-1.5 rounded-sm bg-border" />
              )}
            </span>
          )
          const label = `${formatDay(day, 'long')}: ${state}`
          return (
            <li key={day}>
              {day < startDate ? (
                <span
                  aria-label={`${formatDay(day, 'long')}: before the start`}
                  className="opacity-40"
                >
                  {cell}
                </span>
              ) : (
                <Link
                  to={logPath(assignmentId, { date: day })}
                  aria-label={label}
                  aria-current={day === today ? 'date' : undefined}
                  className="block rounded-md hover:bg-muted"
                >
                  {cell}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
