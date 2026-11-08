import { ArrowDown, ArrowUp, Check, Pencil, RotateCcw } from 'lucide-react'
import { useId, useMemo, useState, type CSSProperties } from 'react'
import { EmptyNote, Page } from '@/components/Page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { addDays, daysBetween, formatDay } from '@/lib/dates'
import {
  usePlanAssignments,
  usePlanEdits,
  usePlanSessions,
  useLoggedSessions,
  useTemplate,
  type PlanAssignment,
  type Template,
} from '@/lib/plan-admin'
import { useToday } from '@/lib/use-today'
import { cn } from '@/lib/utils'
import { pagesLabel, sessionLabel, type PlanItem } from '@/trackers/plan'
import { minutesLabel, sessionMinutes } from '@/trackers/estimate'
import {
  dayOffMoves,
  moveSessions,
  problemIndex,
  problemsFor,
  type Move,
} from '@/trackers/plan-edit'
import { weekStart } from '@/trackers/schedule'
import { TrackerIcon } from '@/trackers/TrackerIcon'

const KINDS = ['study', 'practice', 'review', 'mixed_check'] as const
const KIND_LABEL: Record<(typeof KINDS)[number], string> = {
  study: 'Study',
  practice: 'Practice',
  review: 'Review',
  mixed_check: 'Mixed check',
}

/**
 * The plan editor (admin): every session of a student's plan, by week. Edit a session's
 * date, topic and pages (its problem checkboxes follow the pages), move it and every
 * later one a plan day later (a catch-up day) or earlier, or reset it to the baseline
 * plan it was copied from. The student's Today and My week show the change at once.
 */
export function PlanPage() {
  const assignments = usePlanAssignments()
  const [chosen, setChosen] = useState<string | null>(null)
  const pickerId = useId()

  if (assignments.status === 'pending') {
    return (
      <Page title="Plan">
        <p role="status" className="text-muted-foreground">
          Loading plans…
        </p>
      </Page>
    )
  }
  if (assignments.status === 'error') {
    return (
      <Page title="Plan">
        <EmptyNote>Couldn’t load the plans. Check your connection, then reload.</EmptyNote>
      </Page>
    )
  }
  const list = assignments.data
  const assignment = list.find((a) => a.id === chosen) ?? list[0]
  if (!assignment) {
    return (
      <Page title="Plan">
        <EmptyNote>No student has a planned tracker yet.</EmptyNote>
      </Page>
    )
  }
  return (
    <Page title="Plan" lead="Each session, by week. Edit one, or move it and the rest later.">
      {list.length > 1 ? (
        <label htmlFor={pickerId} className="flex flex-col gap-2 text-small text-muted-foreground">
          Student and tracker
          <select
            id={pickerId}
            value={assignment.id}
            onChange={(e) => {
              setChosen(e.target.value)
            }}
            className="h-11 max-w-sm rounded-md border border-input bg-card px-3 text-body text-foreground"
          >
            {list.map((a) => (
              <option key={a.id} value={a.id}>
                {a.studentName} · {a.tracker.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-body text-foreground">
          {assignment.studentName} · {assignment.tracker.name}
        </p>
      )}
      <PlanEditor key={assignment.id} assignment={assignment} />
    </Page>
  )
}

function PlanEditor({ assignment }: { assignment: PlanAssignment }) {
  const today = useToday()
  const sessions = usePlanSessions(assignment.id)
  const logged = useLoggedSessions(assignment.id)
  const template = useTemplate(assignment.plan_template_id)
  const { save, move } = usePlanEdits(assignment.id)
  const [editing, setEditing] = useState<string | null>(null)
  const [showEarlier, setShowEarlier] = useState(false)
  const [notice, setNotice] = useState<{ text: string; undo?: Move[] } | null>(null)
  // The book's problems by page, from the baseline's sessions that work pages (a mixed
  // check's named problems would add a whole problem beside its parts).
  const index = useMemo(
    () =>
      problemIndex(
        (template.data?.items ?? [])
          .filter((i) => typeof i.details.page_start === 'number')
          .map((i) => ({
            problems: Array.isArray(i.details.problems)
              ? i.details.problems.filter((p): p is string => typeof p === 'string')
              : undefined,
          })),
      ),
    [template.data],
  )
  const estimate = (details: PlanItem['details']) => {
    if (index.size === 0) return null
    const minutes = sessionMinutes(index, details)
    return minutes === null ? null : minutesLabel(minutes)
  }

  if (sessions.status === 'pending') {
    return (
      <p role="status" className="text-muted-foreground">
        Loading the plan…
      </p>
    )
  }
  if (sessions.status === 'error') {
    return <EmptyNote>Couldn’t load this plan. Check your connection, then reload.</EmptyNote>
  }
  const items = sessions.data
  const thisWeek = weekStart(today)
  const weeks = new Map<string, PlanItem[]>()
  for (const item of items) {
    const week = weekStart(item.date)
    weeks.set(week, [...(weeks.get(week) ?? []), item])
  }
  const earlier = [...weeks.keys()].filter((w) => w < thisWeek)
  const shown = [...weeks].filter(([w]) => showEarlier || w >= thisWeek)

  function apply(moves: Move[], text: string) {
    const before = moves.map((m) => ({
      id: m.id,
      date: items.find((i) => i.id === m.id)?.date ?? m.date,
    }))
    move.mutate(moves, {
      onSuccess: () => {
        setNotice({ text, undo: before })
      },
      onError: (error) => {
        setNotice({ text: error.message })
      },
    })
  }

  function shift(item: PlanItem, direction: 1 | -1) {
    const moves = moveSessions(items, item.id, direction)
    if (!moves) {
      setNotice({ text: 'No room to move it earlier: the session before is on that day.' })
      return
    }
    apply(
      moves,
      `Moved ${String(moves.length)} session${moves.length === 1 ? '' : 's'} ${direction === 1 ? 'later' : 'earlier'}, from ${formatDay(moves[0]?.date ?? item.date, 'long')}.`,
    )
  }

  function dayOff(date: string) {
    const moves = dayOffMoves(items, date)
    if (!moves) {
      setNotice({ text: `Nothing is planned on ${formatDay(date, 'long')}, so nothing moved.` })
      return
    }
    const later = moves.length - 1
    apply(
      moves,
      `${formatDay(date, 'long')} is a day off: its session and the ${String(later)} after it moved one plan day later.`,
    )
  }

  return (
    <div
      style={{ '--tracker': `var(--tracker-${assignment.tracker.color})` } as CSSProperties}
      className="flex flex-col gap-6"
    >
      {notice ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card px-5 py-3 text-small text-foreground"
        >
          <span>{notice.text}</span>
          {notice.undo ? (
            <Button
              variant="link"
              size="sm"
              className="h-auto px-0"
              onClick={() => {
                const undo = notice.undo
                if (!undo) return
                move.mutate(undo, {
                  onSuccess: () => {
                    setNotice({ text: 'Moved back.' })
                  },
                })
              }}
            >
              Undo
            </Button>
          ) : null}
        </div>
      ) : null}

      <DayOff today={today} busy={move.isPending} onDayOff={dayOff} />

      {earlier.length > 0 ? (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => {
            setShowEarlier((s) => !s)
          }}
        >
          {showEarlier
            ? 'Hide earlier weeks'
            : `Show ${String(earlier.length)} earlier week${earlier.length === 1 ? '' : 's'}`}
        </Button>
      ) : null}

      {shown.map(([week, weekItems]) => (
        <section
          key={week}
          aria-label={`Week of ${formatDay(week, 'long')}`}
          className="flex flex-col gap-2"
        >
          <h2 className="text-small font-medium text-muted-foreground">
            Week of {formatDay(week, 'long')}
            {week === thisWeek ? ' · this week' : ''}
          </h2>
          <ol className="flex flex-col rounded-lg border border-border bg-card">
            {weekItems.map((item) => (
              <li key={item.id} className="border-b border-border last:border-b-0">
                <SessionRow
                  item={item}
                  estimate={estimate(item.details)}
                  icon={assignment.tracker.icon}
                  logged={logged.data?.has(item.id) ?? false}
                  busy={move.isPending}
                  onEdit={() => {
                    setEditing(editing === item.id ? null : item.id)
                  }}
                  onLater={() => {
                    shift(item, 1)
                  }}
                  onEarlier={() => {
                    shift(item, -1)
                  }}
                />
                {editing === item.id ? (
                  <SessionForm
                    item={item}
                    assignment={assignment}
                    template={template.data}
                    index={index}
                    saving={save.isPending}
                    onCancel={() => {
                      setEditing(null)
                    }}
                    onSave={(edit) => {
                      save.mutate(
                        { id: item.id, edit },
                        {
                          onSuccess: () => {
                            setEditing(null)
                            setNotice({ text: `Saved ${formatDay(edit.date, 'long')}.` })
                          },
                          onError: (error) => {
                            setNotice({ text: error.message })
                          },
                        },
                      )
                    }}
                  />
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}

function SessionRow({
  item,
  estimate,
  icon,
  logged,
  busy,
  onEdit,
  onLater,
  onEarlier,
}: {
  item: PlanItem
  /** "About 45 min", once the baseline's problems are here. */
  estimate: string | null
  icon: string
  logged: boolean
  busy: boolean
  onEdit: () => void
  onLater: () => void
  onEarlier: () => void
}) {
  const problems = Array.isArray(item.details.problems) ? item.details.problems.length : 0
  // Each part stays whole when the line wraps ("About 45 min" never splits).
  const what = [
    pagesLabel(item.details),
    problems > 0 ? `${String(problems)} problems` : null,
    estimate,
  ].filter((part): part is string => Boolean(part))
  const name = `${formatDay(item.date, 'long')}, ${sessionLabel(item.details) ?? item.title}`
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 sm:px-6">
      <TrackerIcon name={icon} className="size-4 shrink-0 self-start mt-1 text-tracker" />
      <span className="flex min-w-48 flex-1 flex-col">
        <span className="flex flex-wrap items-center gap-x-3 text-small text-muted-foreground tabular-nums">
          {formatDay(item.date)}
          {logged ? (
            <span className="flex items-center gap-1 text-foreground">
              <Check aria-hidden className="size-3.5 text-tracker" />
              Logged
            </span>
          ) : null}
        </span>
        <span className="text-foreground">{sessionLabel(item.details) ?? item.title}</span>
        <span className="text-small text-muted-foreground tabular-nums">
          {what.length > 0
            ? what.map((part, i) => (
                <span key={part} className="whitespace-nowrap">
                  {i > 0 ? ' · ' : ''}
                  {part}
                </span>
              ))
            : item.title}
        </span>
      </span>
      <span className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${name}`}>
          <Pencil aria-hidden />
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onLater}
          disabled={busy}
          aria-label={`Move ${name} and every later session one plan day later`}
          title="Move this and every later session one plan day later (a catch-up day)"
        >
          <ArrowDown aria-hidden />
          Later
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onEarlier}
          disabled={busy}
          aria-label={`Move ${name} and every later session one plan day earlier`}
          title="Move this and every later session one plan day earlier"
        >
          <ArrowUp aria-hidden />
          Earlier
        </Button>
      </span>
    </div>
  )
}

function SessionForm({
  item,
  assignment,
  template,
  index,
  saving,
  onCancel,
  onSave,
}: {
  item: PlanItem
  assignment: PlanAssignment
  template: Template | undefined
  index: Map<number, string[]>
  saving: boolean
  onCancel: () => void
  onSave: (edit: { date: string; title: string; details: Record<string, unknown> }) => void
}) {
  const id = useId()
  const d = item.details
  const [date, setDate] = useState(item.date)
  const [topic, setTopic] = useState(typeof d.topic === 'string' ? d.topic : '')
  const [title, setTitle] = useState(item.title)
  const [start, setStart] = useState(typeof d.page_start === 'number' ? String(d.page_start) : '')
  const [end, setEnd] = useState(typeof d.page_end === 'number' ? String(d.page_end) : '')
  const [kind, setKind] = useState(KINDS.find((k) => k === d.kind) ?? 'practice')
  const [readingOnly, setReadingOnly] = useState(d.reading_only === true)
  const [problem, setProblem] = useState<string | null>(null)

  const from = start === '' ? null : Number(start)
  const to = end === '' ? from : Number(end)
  const hasPages = from !== null && to !== null
  const existing = Array.isArray(d.problems)
    ? d.problems.filter((p): p is string => typeof p === 'string')
    : []
  // Problems follow the pages; a session without pages (a mixed check) keeps its own.
  const problems = readingOnly ? [] : hasPages ? problemsFor(index, from, to) : existing
  const minutes =
    index.size === 0
      ? null
      : sessionMinutes(index, hasPages ? { page_start: from, page_end: to } : { problems })

  const baseline = template?.items.find((t) => t.details.session === d.session)
  const shift = template ? daysBetween(template.first_date, assignment.start_date) : 0

  function submit() {
    if (!date) {
      setProblem('Choose a date.')
      return
    }
    if (!title.trim()) {
      setProblem('Give the session a short description.')
      return
    }
    if (hasPages && (!Number.isInteger(from) || !Number.isInteger(to) || to < from || from < 1)) {
      setProblem('Pages run from a smaller page number to a larger one.')
      return
    }
    setProblem(null)
    const details: Record<string, unknown> = {
      ...d,
      topic: topic.trim() || undefined,
      page_start: hasPages ? from : null,
      page_end: hasPages ? to : null,
      kind,
      reading_only: readingOnly,
      problems: problems.length > 0 ? problems : undefined,
    }
    onSave({
      date,
      title: title.trim(),
      details: Object.fromEntries(Object.entries(details).filter(([, v]) => v !== undefined)),
    })
  }

  return (
    <form
      aria-label={`Edit ${formatDay(item.date, 'long')}`}
      className="flex flex-col gap-4 border-t border-border bg-background px-5 py-5 sm:px-6"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" id={`${id}-date`}>
          <Input
            id={`${id}-date`}
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value)
            }}
          />
        </Field>
        <Field label="Topic" id={`${id}-topic`}>
          <Input
            id={`${id}-topic`}
            value={topic}
            onChange={(e) => {
              setTopic(e.target.value)
            }}
          />
        </Field>
        <Field label="First page" id={`${id}-start`}>
          <Input
            id={`${id}-start`}
            inputMode="numeric"
            value={start}
            onChange={(e) => {
              setStart(e.target.value.replace(/[^\d]/g, ''))
            }}
          />
        </Field>
        <Field label="Last page" id={`${id}-end`}>
          <Input
            id={`${id}-end`}
            inputMode="numeric"
            value={end}
            onChange={(e) => {
              setEnd(e.target.value.replace(/[^\d]/g, ''))
            }}
          />
        </Field>
        <Field label="Kind" id={`${id}-kind`}>
          <select
            id={`${id}-kind`}
            value={kind}
            onChange={(e) => {
              setKind(KINDS.find((k) => k === e.target.value) ?? 'practice')
            }}
            className="h-11 rounded-md border border-input bg-card px-3 text-body text-foreground"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description (for you)" id={`${id}-title`}>
          <Input
            id={`${id}-title`}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
            }}
          />
        </Field>
      </div>
      <label className="flex items-center gap-3 text-body text-foreground">
        <input
          type="checkbox"
          checked={readingOnly}
          onChange={(e) => {
            setReadingOnly(e.target.checked)
          }}
          className="size-5 accent-foreground"
        />
        Reading only (no problems to check)
      </label>
      <p className="text-small text-muted-foreground">
        {problems.length === 0
          ? 'No problem checkboxes for this session.'
          : `${String(problems.length)} problem checkbox${problems.length === 1 ? '' : 'es'}: ${problems.join(', ')}`}
      </p>
      {minutes !== null ? (
        <p className="text-small text-muted-foreground">
          {minutesLabel(minutes)} of work
          {minutes > 60
            ? ': more than an hour, before any retries.'
            : minutes < 30
              ? ': under half an hour.'
              : '.'}
        </p>
      ) : null}
      {problem ? (
        <p role="alert" className="text-small text-destructive">
          {problem}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={saving}>
          <Check aria-hidden />
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {baseline ? (
          <Button
            type="button"
            variant="ghost"
            className="ml-auto"
            disabled={saving}
            onClick={() => {
              onSave({
                date: addDays(baseline.date, shift),
                title: baseline.title,
                details: { ...baseline.details },
              })
            }}
          >
            <RotateCcw aria-hidden />
            Reset to the baseline
          </Button>
        ) : null}
      </div>
    </form>
  )
}

/**
 * A day off (a conflict, a sick day): that day's session and every later one move to the
 * next plan day, keeping the rest day free. Only the admin sees this; the student's
 * Today and My week simply show the new dates.
 */
function DayOff({
  today,
  busy,
  onDayOff,
}: {
  today: string
  busy: boolean
  onDayOff: (date: string) => void
}) {
  const id = useId()
  const [date, setDate] = useState(today)
  return (
    <form
      aria-label="Day off"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card px-5 py-4 sm:px-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (date) onDayOff(date)
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Day off" id={id}>
          <Input
            id={id}
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value)
            }}
            className="w-44"
          />
        </Field>
        <Button type="submit" variant="outline" disabled={busy || !date}>
          <ArrowDown aria-hidden />
          Move the work back a day
        </Button>
      </div>
      <p className="text-small text-muted-foreground">
        That day’s session and every one after it move to the next plan day. The rest day stays
        free.
      </p>
    </form>
  )
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-2')}>
      <label htmlFor={id} className="text-small font-medium text-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}
