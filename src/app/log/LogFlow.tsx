import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import {
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDay } from '@/lib/dates'
import { useOutbox } from '@/lib/outbox/outbox-context'
import type { EntryView, FollowupView } from '@/lib/outbox/overlay'
import { queuePhotos } from '@/lib/outbox/queue-photos'
import { deleteDraft, saveDraft } from '@/lib/outbox/store'
import type { Draft } from '@/lib/outbox/types'
import type { Tracker } from '@/lib/student-data'
import type { FieldDefinition } from '@/trackers/definition'
import {
  cleanEntry,
  promptFor,
  shownFields,
  type EntryData,
  type EntryIssue,
} from '@/trackers/entry'
import { FIELD_REGISTRY } from '@/trackers/fields/registry'
import { defaultDue, retryChanges, retryLabels } from '@/trackers/followups'
import { topicLabel, type PlanItem } from '@/trackers/plan'
import { TrackerIcon } from '@/trackers/TrackerIcon'

/** How long after the last change the draft is written to the device. */
const AUTOSAVE_MS = 300

/**
 * The log flow (CLAUDE.md, "Log session"): one field per screen, keyboard first. Enter
 * moves on (Shift+Enter starts a new line in long answers), and every change is kept on
 * the device so leaving loses nothing. Saving makes a retry of each item checked in the
 * tracker's followups field (the problems the student struggled with).
 */
export function LogFlow({
  tracker,
  plan,
  existing,
  existingFollowups,
  draft,
  today,
  startDate,
}: {
  tracker: Tracker
  plan: PlanItem | null
  existing: EntryView | undefined
  /** The edited entry's retries, whatever their status. */
  existingFollowups: FollowupView[]
  draft: Draft
  today: string
  /** The assignment's first day: nothing can be logged before it. */
  startDate: string
}) {
  const outbox = useOutbox()
  const navigate = useNavigate()
  const baseId = useId()
  const details = plan?.details ?? null

  const [data, setData] = useState<EntryData>(draft.data)
  const [index, setIndex] = useState(draft.step)
  const [issue, setIssue] = useState<EntryIssue | null>(null)
  const [saving, setSaving] = useState(false)
  /** The day the session was done: today, or earlier when logging late. */
  const [date, setDate] = useState(draft.date)

  const rules = tracker.followups

  // One step per field shown, as cleanEntry will judge them.
  const steps: FieldDefinition[] = useMemo(
    () => shownFields(tracker.fields, data, details),
    [tracker.fields, data, details],
  )
  const at = Math.min(index, steps.length - 1)
  const field = steps[at]
  const last = at === steps.length - 1

  // Keep the draft on the device, a moment after each change.
  const finished = useRef(false)
  useEffect(() => {
    if (finished.current) return
    const timer = window.setTimeout(() => {
      if (finished.current) return
      void saveDraft({
        ...draft,
        date,
        data,
        step: at,
        updatedAt: new Date().toISOString(),
      })
    }, AUTOSAVE_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [draft, date, data, at])

  /** The step's problem, if any, judged exactly as the database will judge it. */
  function problemWith(current: FieldDefinition): EntryIssue | null {
    const result = cleanEntry(tracker.fields, data, details)
    return result.ok ? null : (result.issues.find((i) => i.key === current.key) ?? null)
  }

  /**
   * Queues the retries the saved entry calls for: one per item checked, due a couple of
   * days after the session. Editing reopens a dropped one that's checked again and drops
   * an open one that isn't; one already done stays done.
   */
  async function saveRetries(entryId: string, saved: EntryData) {
    if (!rules) return
    const changes = retryChanges(retryLabels(rules, saved), existingFollowups)
    const due = defaultDue(rules, date, today)
    for (const label of changes.create) {
      await outbox.enqueue({
        kind: 'followup.create',
        row: {
          id: crypto.randomUUID(),
          entry_id: entryId,
          assignment_id: draft.assignmentId,
          label,
          due_date: due,
          status: 'open',
          owner_id: outbox.userId,
        },
      })
    }
    for (const id of changes.reopen) {
      await outbox.enqueue({ kind: 'followup.update', id, patch: { status: 'open' } })
    }
    for (const id of changes.drop) {
      await outbox.enqueue({ kind: 'followup.update', id, patch: { status: 'dropped' } })
    }
  }

  async function save() {
    const result = cleanEntry(tracker.fields, data, details)
    if (!result.ok) {
      const first = result.issues[0]
      const where = steps.findIndex((s) => s.key === first?.key)
      if (where >= 0) setIndex(where)
      setIssue(first ?? null)
      return
    }
    setSaving(true)
    finished.current = true
    if (existing) {
      await outbox.enqueue({
        kind: 'entry.update',
        id: existing.id,
        patch: { data: result.data, field_version: tracker.field_version, date },
      })
    } else {
      await outbox.enqueue({
        kind: 'entry.create',
        row: {
          id: draft.entryId,
          assignment_id: draft.assignmentId,
          plan_item_id: draft.planItemId,
          field_version: tracker.field_version,
          date,
          data: result.data,
          owner_id: outbox.userId,
        },
      })
    }
    const entryId = existing?.id ?? draft.entryId
    await queuePhotos(outbox.enqueue, tracker.fields, result.data, entryId, outbox.userId)
    await saveRetries(entryId, result.data)
    await deleteDraft(draft.key)
    void navigate('/today', { state: { saved: existing?.id ?? draft.entryId } })
  }

  function next() {
    if (!field || saving) return
    const problem = problemWith(field)
    if (problem) {
      setIssue(problem)
      return
    }
    setIssue(null)
    if (last) void save()
    else setIndex(at + 1)
  }

  function back() {
    setIssue(null)
    setIndex(Math.max(0, at - 1))
  }

  // Enter moves on from anything that isn't a text box (text boxes call next() themselves):
  // checkboxes, radios, the tally buttons. Listening first stops a tally button's own
  // Enter-click from adding one more. Alt+← goes back, outside text.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target instanceof HTMLElement ? event.target : null
    const typing =
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLInputElement && !['checkbox', 'radio'].includes(target.type))
    if (target?.closest('[data-flow-nav]')) return
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !typing) {
      event.preventDefault()
      next()
    } else if (event.key === 'ArrowLeft' && event.altKey && !typing) {
      event.preventDefault()
      back()
    }
  })
  useEffect(() => {
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
    }
  }, [])

  if (!field) return null
  const labelId = `${baseId}-label`
  const helpId = `${baseId}-help`
  const problemId = `${baseId}-problem`
  // The topic is enough to say where you are; the pages are on Today and in the problem list.
  const subtitle = plan ? (topicLabel(plan.details) ?? plan.title) : formatDay(date, 'long')
  const help = field.rotatingPrompts ? promptFor(field, details) : field.help
  const describedBy =
    [help ? helpId : null, issue ? problemId : null].filter(Boolean).join(' ') || undefined
  const { Renderer } = FIELD_REGISTRY[field.type]

  return (
    <div
      style={{ '--tracker': `var(--tracker-${tracker.color})` } as CSSProperties}
      className="flex flex-col gap-8"
    >
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-small">
          <Link
            to="/today"
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Back to Today
          </Link>
          <p className="text-muted-foreground">Your answers are kept.</p>
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-small text-foreground">
            <TrackerIcon name={tracker.icon} className="size-4 text-tracker" />
            {tracker.name}
          </h1>
          <p className="text-lead text-foreground">{subtitle}</p>
        </div>
        {plan && (plan.date < today || existing) ? (
          <label className="flex items-center gap-3 text-small text-muted-foreground">
            Done on
            <Input
              type="date"
              value={date}
              min={startDate}
              max={today}
              onChange={(e) => {
                const next = e.target.value
                if (!next || next < startDate || next > today) return
                setDate(next)
              }}
              className="h-9 w-auto"
            />
          </label>
        ) : null}
        <div className="flex items-center gap-3">
          <div
            className="h-1 flex-1 overflow-hidden rounded-sm bg-muted"
            role="progressbar"
            aria-label="Progress"
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-valuenow={at + 1}
          >
            <div
              className="h-full bg-tracker transition-[width] duration-200"
              style={{ width: `${((at + 1) / steps.length) * 100}%` }}
            />
          </div>
          <p className="text-small text-muted-foreground tabular-nums">
            {at + 1} of {steps.length}
          </p>
        </div>
      </header>

      <section aria-labelledby={labelId} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 id={labelId} className="font-heading text-display text-foreground">
            {field.label}
            {!field.required ? (
              <>
                {/* Only the space before it: wrapped onto its own line, it starts flush. */}{' '}
                <span className="inline-block font-sans text-small font-normal text-muted-foreground">
                  optional
                </span>
              </>
            ) : null}
          </h2>
          {help ? (
            <p id={helpId} className="text-muted-foreground">
              {help}
            </p>
          ) : null}
        </div>
        <Renderer
          key={field.key}
          field={field}
          value={data[field.key] ?? null}
          onChange={(value) => {
            setData((d) => ({ ...d, [field.key]: value }))
            if (issue) setIssue(null)
          }}
          labelId={labelId}
          describedBy={describedBy}
          invalid={issue !== null}
          autoFocus
          hotkeys
          onSubmit={next}
          placeholder={field.rotatingPrompts ? '' : undefined}
          plan={details}
        />
        {issue ? (
          <p id={problemId} role="alert" className="text-destructive">
            {issue.message}
          </p>
        ) : null}
      </section>

      <nav data-flow-nav aria-label="Steps" className="flex items-center gap-3">
        {at > 0 ? (
          <Button type="button" variant="outline" size="lg" onClick={back}>
            <ArrowLeft aria-hidden />
            Back
          </Button>
        ) : null}
        <Button type="button" size="lg" onClick={next} disabled={saving}>
          {last ? (
            <>
              <Check aria-hidden />
              Save
            </>
          ) : (
            <>
              Next
              <ArrowRight aria-hidden />
            </>
          )}
        </Button>
        {/* Keyboard hints are for laptops; a phone keyboard has its own Next. */}
        <p className="hidden text-small text-muted-foreground sm:block">
          <kbd className="font-sans">Enter</kbd>
          {field.type === 'long_text' ? ' · Shift+Enter for a new line' : null}
        </p>
      </nav>
    </div>
  )
}
