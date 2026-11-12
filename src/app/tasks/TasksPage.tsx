import { Check, Repeat as RepeatIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { EmptyNote, Page } from '@/components/Page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useStudents, type Student } from '@/lib/admin-logs'
import { addDays, formatDay } from '@/lib/dates'
import {
  useStudentTasks,
  useTaskEdits,
  useTaskTracker,
  type AdminTask,
  type TaskTracker,
} from '@/lib/tasks-admin'
import { useToday } from '@/lib/use-today'
import { cn } from '@/lib/utils'
import { MAX_REPEATS, taskDates, taskNotes, taskSeries, type Repeat } from '@/trackers/tasks'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const TITLE_MAX = 200

const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay()

const names = (students: readonly Student[], ids: readonly string[]) => {
  const list = students.filter((s) => ids.includes(s.id)).map((s) => s.name)
  return list.length <= 2
    ? list.join(' and ')
    : `${list.slice(0, -1).join(', ')} and ${list.at(-1) ?? ''}`
}

/**
 * Tasks (admin): add work for a student on any day, once or repeating, and see what's
 * done. The student ticks each one off on Today. Tasks are the task tracker's plan items,
 * so they show in My week and Overview like any session.
 */
export function TasksPage() {
  const tracker = useTaskTracker()
  const students = useStudents()
  const [chosen, setChosen] = useState<string | null>(null)
  const pickerId = useId()
  const lead = 'Add work for a student on any day. They tick it off on Today.'

  if (tracker.status === 'pending' || students.status === 'pending') {
    return (
      <Page title="Tasks">
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      </Page>
    )
  }
  if (tracker.status === 'error' || students.status === 'error') {
    return (
      <Page title="Tasks">
        <EmptyNote>Couldn’t load tasks. Check your connection, then reload.</EmptyNote>
      </Page>
    )
  }
  if (!tracker.data) {
    return (
      <Page title="Tasks">
        <EmptyNote>
          Tasks aren’t set up yet: the Tasks tracker is missing. Add it with the seed, then reload.
        </EmptyNote>
      </Page>
    )
  }
  const list = students.data
  const student = list.find((s) => s.id === chosen) ?? list[0]
  if (!student) {
    return (
      <Page title="Tasks" lead={lead}>
        <EmptyNote>No student has a tracker yet. Assign one first, then add tasks here.</EmptyNote>
      </Page>
    )
  }
  return (
    <Page title="Tasks" lead={lead}>
      <AddTask tracker={tracker.data} students={list} defaultStudent={student.id} />
      <section aria-labelledby={`${pickerId}-heading`} className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id={`${pickerId}-heading`} className="font-heading text-title text-foreground">
            {list.length > 1 ? 'Tasks for' : `${student.name}’s tasks`}
          </h2>
          {list.length > 1 ? (
            <select
              aria-label="Student"
              value={student.id}
              onChange={(e) => {
                setChosen(e.target.value)
              }}
              className="h-11 min-w-40 rounded-md border border-input bg-card px-3 text-body text-foreground"
            >
              {list.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <TaskList key={student.id} tracker={tracker.data} student={student} />
      </section>
    </Page>
  )
}

/** The form for a new task: who, what, when, and whether it repeats. */
function AddTask({
  tracker,
  students,
  defaultStudent,
}: {
  tracker: TaskTracker
  students: Student[]
  defaultStudent: string
}) {
  const today = useToday()
  const id = useId()
  const { add } = useTaskEdits()
  const [who, setWho] = useState<string[]>([defaultStudent])
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(today)
  const [kind, setKind] = useState<Repeat['kind']>('none')
  const [days, setDays] = useState<number[]>([weekday(today)])
  const [until, setUntil] = useState(addDays(today, 6))
  const [problem, setProblem] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  const repeat: Repeat =
    kind === 'none' ? { kind } : kind === 'daily' ? { kind, until } : { kind, days, until }
  const dates = taskDates(date, repeat)
  const span =
    dates === null
      ? `That’s more than ${MAX_REPEATS} tasks: choose an earlier last day.`
      : dates.length === 0
        ? 'No days match: check the days and the last day.'
        : kind === 'none'
          ? null
          : `${dates.length === 1 ? '1 task' : `${dates.length} tasks`}, ${formatDay(dates[0] ?? date, 'long')} to ${formatDay(dates.at(-1) ?? date, 'long')}.`

  async function submit() {
    setNotice(null)
    if (!title.trim()) {
      setProblem('Say what the task is.')
      titleRef.current?.focus()
      return
    }
    if (who.length === 0) {
      setProblem('Choose at least one student.')
      return
    }
    if (!dates || dates.length === 0) {
      setProblem(span)
      return
    }
    setProblem(null)
    try {
      await add.mutateAsync({ tracker, studentIds: who, title, notes, dates, today })
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'It wasn’t added. Try again.')
      return
    }
    const first = dates[0] ?? date
    const last = dates.at(-1) ?? date
    setNotice(
      dates.length === 1
        ? `Added “${title.trim()}” for ${names(students, who)} on ${formatDay(first, 'long')}.`
        : `Added “${title.trim()}” for ${names(students, who)}: ${dates.length} days, ${formatDay(first, 'long')} to ${formatDay(last, 'long')}.`,
    )
    setTitle('')
    setNotes('')
    titleRef.current?.focus()
  }

  const labelClass = 'flex flex-col gap-2 text-small text-muted-foreground'
  return (
    <form
      aria-labelledby={`${id}-heading`}
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      className="flex flex-col gap-5 rounded-lg border border-border bg-card p-5 sm:p-6"
    >
      <h2 id={`${id}-heading`} className="font-heading text-title text-foreground">
        Add a task
      </h2>
      {students.length > 1 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-small text-muted-foreground">For</legend>
          <div className="flex flex-wrap gap-2">
            {students.map((s) => (
              <Toggle
                key={s.id}
                label={s.name}
                checked={who.includes(s.id)}
                onChange={(on) => {
                  setWho((list) => (on ? [...list, s.id] : list.filter((x) => x !== s.id)))
                }}
              />
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="text-body text-foreground">For {students[0]?.name}</p>
      )}
      <label className={labelClass}>
        Task
        <Input
          ref={titleRef}
          value={title}
          maxLength={TITLE_MAX}
          placeholder="Read chapter 3"
          aria-invalid={problem !== null && !title.trim() ? true : undefined}
          onChange={(e) => {
            setTitle(e.target.value)
          }}
        />
      </label>
      <label className={labelClass}>
        Notes (optional)
        <Textarea
          value={notes}
          rows={2}
          maxLength={1000}
          onChange={(e) => {
            setNotes(e.target.value)
          }}
        />
      </label>
      <div className="flex flex-wrap gap-4">
        <label className={labelClass}>
          {kind === 'none' ? 'Day' : 'First day'}
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value)
            }}
            className="w-auto"
          />
        </label>
        <label className={labelClass}>
          Repeat
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as Repeat['kind'])
            }}
            className="h-10 rounded-md border border-input bg-card px-3 text-body text-foreground"
          >
            <option value="none">Doesn’t repeat</option>
            <option value="daily">Every day</option>
            <option value="weekdays">On chosen days</option>
          </select>
        </label>
        {kind !== 'none' ? (
          <label className={labelClass}>
            Last day
            <Input
              type="date"
              value={until}
              min={date}
              onChange={(e) => {
                if (e.target.value) setUntil(e.target.value)
              }}
              className="w-auto"
            />
          </label>
        ) : null}
      </div>
      {kind === 'weekdays' ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-small text-muted-foreground">On</legend>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((label, day) => (
              <Toggle
                key={label}
                label={label}
                name={WEEKDAY_NAMES[day]}
                checked={days.includes(day)}
                onChange={(on) => {
                  setDays((list) => (on ? [...list, day].sort() : list.filter((d) => d !== day)))
                }}
              />
            ))}
          </div>
        </fieldset>
      ) : null}
      {span ? <p className="text-small text-muted-foreground">{span}</p> : null}
      {problem ? (
        <p role="alert" className="text-destructive">
          {problem}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={add.isPending}>
          Add task
        </Button>
        <p role="status" className="text-small text-muted-foreground empty:hidden">
          {notice}
        </p>
      </div>
    </form>
  )
}

/** A pressable choice (a student, a weekday): a checkbox that looks like a button. */
function Toggle({
  label,
  name,
  checked,
  onChange,
}: {
  label: string
  /** The accessible name, when the label is short ("Mon" for Monday). */
  name?: string
  checked: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <label className="relative">
      <input
        type="checkbox"
        checked={checked}
        aria-label={name}
        onChange={(e) => {
          onChange(e.target.checked)
        }}
        className="peer sr-only"
      />
      <span
        className={cn(
          'flex h-10 min-w-12 cursor-pointer items-center justify-center rounded-md border border-input bg-card px-3',
          'text-small font-medium text-foreground select-none transition-colors hover:bg-muted',
          'peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-checked:hover:bg-primary',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring',
        )}
      >
        {label}
      </span>
    </label>
  )
}

/** One student's tasks: coming up by day, and earlier ones folded. */
function TaskList({ tracker, student }: { tracker: TaskTracker; student: Student }) {
  const today = useToday()
  const tasks = useStudentTasks(tracker.id, student.id)
  const [notice, setNotice] = useState<string | null>(null)

  if (tasks.status === 'pending') {
    return (
      <p role="status" className="text-muted-foreground">
        Loading {student.name}’s tasks…
      </p>
    )
  }
  if (tasks.status === 'error') {
    return <EmptyNote>Couldn’t load {student.name}’s tasks. Reload to try again.</EmptyNote>
  }
  const all = tasks.data
  const coming = all.filter((t) => t.date >= today)
  const earlier = all.filter((t) => t.date < today).reverse()
  const days = [...new Set(coming.map((t) => t.date))]

  const row = (task: AdminTask) => (
    <TaskItem key={task.id} task={task} all={all} today={today} onDone={setNotice} />
  )
  return (
    <div className="flex flex-col gap-6">
      <p role="status" className="text-small text-muted-foreground empty:hidden">
        {notice}
      </p>
      {all.length === 0 ? (
        <EmptyNote>
          No tasks yet. Ones you add show on {student.name}’s Today on their day.
        </EmptyNote>
      ) : null}
      {days.map((day) => (
        <section key={day} aria-label={formatDay(day, 'long')} className="flex flex-col gap-2">
          <h3 className="text-body font-medium text-foreground">
            {day === today ? `Today · ${formatDay(day, 'long')}` : formatDay(day, 'long')}
          </h3>
          <ul className="flex flex-col rounded-lg border border-border bg-card">
            {coming.filter((t) => t.date === day).map(row)}
          </ul>
        </section>
      ))}
      {earlier.length > 0 ? (
        <details className="group flex flex-col gap-2">
          <summary className="cursor-pointer text-body font-medium text-foreground">
            Earlier ({earlier.length})
          </summary>
          <ul className="mt-2 flex flex-col rounded-lg border border-border bg-card">
            {earlier.map(row)}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

/** One task: what it is, whether it's done, and Edit / Delete. */
function TaskItem({
  task,
  all,
  today,
  onDone,
}: {
  task: AdminTask
  all: AdminTask[]
  today: string
  onDone: (notice: string) => void
}) {
  const { save, remove } = useTaskEdits()
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view')
  const [problem, setProblem] = useState<string | null>(null)
  const notes = taskNotes(task.details)
  const series = taskSeries(task.details)
  const later = series
    ? all.filter((t) => taskSeries(t.details) === series && t.date >= task.date)
    : [task]
  const editButton = useRef<HTMLButtonElement>(null)
  const keepButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (mode === 'delete') keepButton.current?.focus()
  }, [mode])

  async function run(action: () => Promise<unknown>, notice: string) {
    setProblem(null)
    try {
      await action()
      setMode('view')
      onDone(notice)
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That didn’t work. Try again.')
    }
  }

  const status = task.entry ? (
    <span className="flex items-center gap-1 text-small text-foreground">
      <Check aria-hidden className="size-4 text-tracker" />
      Done {formatDay(task.entry.date, 'long')}
    </span>
  ) : task.date < today ? (
    <span className="text-small text-muted-foreground">Not done</span>
  ) : task.date === today ? (
    <span className="text-small font-medium text-foreground">To do</span>
  ) : null

  return (
    <li className="flex flex-col gap-3 border-b border-border p-4 last:border-b-0 sm:px-5">
      {mode === 'edit' ? (
        <EditTask
          task={task}
          pending={save.isPending}
          onCancel={() => {
            setMode('view')
            editButton.current?.focus()
          }}
          onSave={(edit) =>
            run(() => save.mutateAsync({ task, edit }), `Saved “${edit.title.trim()}”.`)
          }
        />
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-body font-medium text-foreground">{task.title}</span>
            {notes ? (
              <span className="text-small whitespace-pre-line text-muted-foreground">{notes}</span>
            ) : null}
            {series ? (
              <span className="flex items-center gap-1 text-small text-muted-foreground">
                <RepeatIcon aria-hidden className="size-3.5" />
                Repeats
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-4">
            {status}
            <Button
              ref={editButton}
              variant="link"
              size="sm"
              className="h-auto px-0"
              aria-label={`Edit ${task.title}, ${formatDay(task.date, 'long')}`}
              onClick={() => {
                setMode('edit')
              }}
            >
              Edit
            </Button>
            <Button
              variant="link"
              size="sm"
              className="h-auto px-0 text-muted-foreground"
              aria-label={`Delete ${task.title}, ${formatDay(task.date, 'long')}`}
              onClick={() => {
                setMode('delete')
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      )}
      {mode === 'delete' ? (
        <div
          role="group"
          aria-label={`Delete “${task.title}”?`}
          className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setMode('view')
          }}
        >
          <p className="text-foreground">
            Delete “{task.title}”?
            {task.entry ? ' It’s done: deleting it also clears that log.' : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              disabled={remove.isPending}
              onClick={() => void run(() => remove.mutateAsync([task]), `Deleted “${task.title}”.`)}
            >
              Delete it
            </Button>
            {later.length > 1 ? (
              <Button
                variant="danger"
                disabled={remove.isPending}
                onClick={() =>
                  void run(
                    () => remove.mutateAsync(later),
                    `Deleted “${task.title}” from ${formatDay(task.date, 'long')} on (${later.length} days).`,
                  )
                }
              >
                Delete it and the {later.length - 1} after it
              </Button>
            ) : null}
            <Button
              ref={keepButton}
              variant="outline"
              onClick={() => {
                setMode('view')
              }}
            >
              Keep it
            </Button>
          </div>
        </div>
      ) : null}
      {problem ? (
        <p role="alert" className="text-destructive">
          {problem}
        </p>
      ) : null}
    </li>
  )
}

function EditTask({
  task,
  pending,
  onCancel,
  onSave,
}: {
  task: AdminTask
  pending: boolean
  onCancel: () => void
  onSave: (edit: { title: string; notes: string; date: string }) => Promise<void>
}) {
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(taskNotes(task.details) ?? '')
  const [date, setDate] = useState(task.date)
  const labelClass = 'flex flex-col gap-2 text-small text-muted-foreground'
  return (
    <form
      aria-label={`Edit ${task.title}`}
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (title.trim()) void onSave({ title, notes, date })
      }}
    >
      <label className={labelClass}>
        Task
        <Input
          value={title}
          maxLength={TITLE_MAX}
          autoFocus
          onChange={(e) => {
            setTitle(e.target.value)
          }}
        />
      </label>
      <label className={labelClass}>
        Notes (optional)
        <Textarea
          value={notes}
          rows={2}
          maxLength={1000}
          onChange={(e) => {
            setNotes(e.target.value)
          }}
        />
      </label>
      <label className={labelClass}>
        Day
        <Input
          type="date"
          value={date}
          onChange={(e) => {
            if (e.target.value) setDate(e.target.value)
          }}
          className="w-auto"
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !title.trim()}>
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
