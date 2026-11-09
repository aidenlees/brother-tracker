import { Check, TriangleAlert } from 'lucide-react'
import { useOutbox } from '@/lib/outbox/outbox-context'
import { isEditable, type EntryView } from '@/lib/outbox/overlay'
import { formatDay } from '@/lib/dates'
import type { Assignment, Tracker } from '@/lib/student-data'
import { cn } from '@/lib/utils'
import type { PlanItem } from '@/trackers/plan'
import { taskNotes, type TaskDay, type TaskRow } from '@/trackers/tasks'

/**
 * Tasks the admin added (display: task_list), ticked off with one tap. Today's, then any
 * from earlier still to do, then one line for what's next. Ticking logs an entry for the
 * task, dated today, through the outbox (so it works offline); unticking clears it.
 */
export function TaskCard({
  assignment,
  tracker,
  day,
  today,
}: {
  assignment: Assignment
  tracker: Tracker
  day: TaskDay<EntryView>
  today: string
}) {
  const outbox = useOutbox()
  // A task's one field: the checkbox that says it's done ("done" in the seed).
  const field = tracker.fields.find((f) => f.type === 'checkbox')

  async function toggle(row: TaskRow<EntryView>, on: boolean) {
    if (!field) return
    if (on) {
      await outbox.enqueue({
        kind: 'entry.create',
        row: {
          id: crypto.randomUUID(),
          assignment_id: assignment.id,
          plan_item_id: row.item.id,
          field_version: tracker.field_version,
          date: today,
          data: { [field.key]: true },
          owner_id: outbox.userId,
        },
      })
    } else if (row.entry && isEditable(row.entry)) {
      await outbox.clear(row.entry.id, [])
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {day.today.length > 0 ? (
        <TaskList label="Today’s tasks" rows={day.today} onToggle={toggle} />
      ) : (
        <p className="text-muted-foreground">No tasks today.</p>
      )}
      {day.earlier.length > 0 ? (
        <section aria-labelledby={`${assignment.id}-earlier`} className="flex flex-col gap-3">
          <h3 id={`${assignment.id}-earlier`} className="text-body font-medium text-foreground">
            Still to do
          </h3>
          <TaskList label="Still to do" rows={day.earlier} onToggle={toggle} showDate />
        </section>
      ) : null}
      {day.next ? <Next item={day.next} /> : null}
    </div>
  )
}

function TaskList({
  label,
  rows,
  onToggle,
  showDate = false,
}: {
  label: string
  rows: TaskRow<EntryView>[]
  onToggle: (row: TaskRow<EntryView>, on: boolean) => Promise<void>
  showDate?: boolean
}) {
  return (
    <ul aria-label={label} className="flex flex-col gap-3">
      {rows.map((row) => {
        const done = row.entry !== undefined
        const locked = done && row.entry !== undefined && !isEditable(row.entry)
        const notes = taskNotes(row.item.details)
        return (
          <li key={row.item.id} className="flex flex-col gap-1">
            <label
              className={cn('flex items-start gap-3', locked ? 'cursor-default' : 'cursor-pointer')}
            >
              <input
                type="checkbox"
                checked={done}
                disabled={locked}
                onChange={(e) => {
                  void onToggle(row, e.target.checked)
                }}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-input bg-card',
                  'transition-[transform,background-color] duration-150 active:scale-[0.94]',
                  'peer-checked:border-tracker peer-checked:bg-tracker peer-checked:text-primary-foreground',
                  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring',
                )}
              >
                {done ? <Check className="size-4 animate-check" /> : null}
              </span>
              <span className="flex min-w-0 flex-col">
                <span
                  className={cn(
                    'text-body',
                    done ? 'text-muted-foreground line-through' : 'text-foreground',
                  )}
                >
                  {row.item.title}
                </span>
                {notes || showDate ? (
                  <span className="text-small whitespace-pre-line text-muted-foreground">
                    {[showDate ? `From ${formatDay(row.item.date, 'long')}` : null, notes]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                ) : null}
              </span>
            </label>
            {row.entry?.sync === 'parked' ? (
              <p className="ml-9 flex items-start gap-2 text-small text-destructive">
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>Couldn’t sync. {row.entry.reason}</span>
              </p>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function Next({ item }: { item: PlanItem }) {
  return (
    <p className="text-small text-muted-foreground">
      <span className="font-medium text-foreground">Next:</span> {formatDay(item.date, 'long')} ·{' '}
      {item.title}
    </p>
  )
}
