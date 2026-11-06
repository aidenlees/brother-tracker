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
import { characters } from '@/trackers/fields/contract'
import { FIELD_REGISTRY } from '@/trackers/fields/registry'
import { defaultDue, retryCount, retryFields } from '@/trackers/followups'
import { pageLabel, sessionLabel, type PlanItem } from '@/trackers/plan'
import { TrackerIcon } from '@/trackers/TrackerIcon'
import { withSpareRow, type Retry } from './retries'
import { RetryStep } from './RetryStep'

/** How long after the last change the draft is written to the device. */
const AUTOSAVE_MS = 300

type Step = { kind: 'field'; field: FieldDefinition } | { kind: 'retries' }
const RETRY_LABEL_MAX = 80

/**
 * The log flow (CLAUDE.md, "Log session"): one field per screen, keyboard first. Enter
 * moves on (Shift+Enter starts a new line in long answers), the tally keys work without
 * clicking, and every change is kept on the device so leaving loses nothing.
 */
export function LogFlow({
  tracker,
  plan,
  existing,
  existingRetries,
  draft,
  today,
  startDate,
}: {
  tracker: Tracker
  plan: PlanItem | null
  existing: EntryView | undefined
  /** The edited entry's open retries. */
  existingRetries: FollowupView[]
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
  const [due, setDue] = useState(() => (rules ? defaultDue(rules, draft.date, today) : draft.date))
  const [retries, setRetries] = useState<Retry[]>(() => withSpareRow(draft.followups, due))
  const kept = retries.filter((r) => r.label.trim() !== '')

  // The fields, with the retry step after the tally when any problem needed help.
  const steps: Step[] = useMemo(() => {
    const fields: Step[] = shownFields(tracker.fields, data, details).map((field) => ({
      kind: 'field',
      field,
    }))
    if (!rules || (retryCount(rules, data) === 0 && kept.length === 0)) return fields
    const after = fields.findLastIndex(
      (s) => s.kind === 'field' && retryFields(rules).has(s.field.key),
    )
    return after < 0
      ? fields
      : [...fields.slice(0, after + 1), { kind: 'retries' }, ...fields.slice(after + 1)]
  }, [tracker.fields, data, details, rules, kept.length])
  const at = Math.min(index, steps.length - 1)
  const step = steps[at]
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
        followups: retries.filter((r) => r.label.trim() !== ''),
        step: at,
        updatedAt: new Date().toISOString(),
      })
    }, AUTOSAVE_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [draft, date, data, retries, at])

  /** The step's problem, if any, judged exactly as the database will judge it. */
  function problemWith(current: Step): EntryIssue | null {
    if (current.kind === 'retries') {
      const long = kept.find((r) => characters(r.label.trim()) > RETRY_LABEL_MAX)
      return long
        ? { key: 'retries', message: `Keep each retry to ${RETRY_LABEL_MAX} characters or fewer` }
        : null
    }
    const result = cleanEntry(tracker.fields, data, details)
    return result.ok ? null : (result.issues.find((i) => i.key === current.field.key) ?? null)
  }

  /** Queues the retries: new ones, changed ones, and ones removed (dropped). */
  async function saveRetries(entryId: string) {
    const before = new Map(existingRetries.map((f) => [f.id, f]))
    for (const retry of kept) {
      const label = retry.label.trim()
      const old = before.get(retry.id)
      if (!old) {
        await outbox.enqueue({
          kind: 'followup.create',
          row: {
            id: retry.id,
            entry_id: entryId,
            assignment_id: draft.assignmentId,
            label,
            due_date: retry.due_date,
            status: 'open',
            owner_id: outbox.userId,
          },
        })
      } else if (old.label !== label || old.due_date !== retry.due_date) {
        await outbox.enqueue({
          kind: 'followup.update',
          id: retry.id,
          patch: { label, due_date: retry.due_date },
        })
      }
    }
    for (const old of existingRetries) {
      if (!kept.some((r) => r.id === old.id)) {
        await outbox.enqueue({ kind: 'followup.update', id: old.id, patch: { status: 'dropped' } })
      }
    }
  }

  async function save() {
    const result = cleanEntry(tracker.fields, data, details)
    if (!result.ok) {
      const first = result.issues[0]
      const where = steps.findIndex((s) => s.kind === 'field' && s.field.key === first?.key)
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
    await saveRetries(entryId)
    await deleteDraft(draft.key)
    void navigate('/today', { state: { saved: existing?.id ?? draft.entryId } })
  }

  function next() {
    if (!step || saving) return
    const problem = problemWith(step)
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

  if (!step) return null
  const labelId = `${baseId}-label`
  const helpId = `${baseId}-help`
  const problemId = `${baseId}-problem`
  const session = plan ? sessionLabel(plan.details) : null
  const pages = plan ? pageLabel(plan.details) : null
  const count = rules ? retryCount(rules, data) : 0
  const field = step.kind === 'field' ? step.field : null
  const title = field ? field.label : 'Problems to retry'
  const optional = field ? !field.required : true
  const help = field
    ? field.rotatingPrompts
      ? promptFor(field, details)
      : field.help
    : `${count === 1 ? '1 problem' : `${String(count)} problems`} needed help. Add the ones to redo, one per line, or leave this empty.`
  const describedBy =
    [help ? helpId : null, issue ? problemId : null].filter(Boolean).join(' ') || undefined
  const Renderer = field ? FIELD_REGISTRY[field.type].Renderer : null

  return (
    <div
      style={{ '--tracker': `var(--tracker-${tracker.color})` } as CSSProperties}
      className="flex max-w-xl flex-col gap-8"
    >
      <header className="flex flex-col gap-3">
        <Link
          to="/today"
          className="flex items-center gap-1.5 self-start text-small text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Today (your answers are kept)
        </Link>
        <h1 className="flex flex-wrap items-baseline gap-x-2 text-body text-foreground">
          <TrackerIcon name={tracker.icon} className="size-4 self-center text-tracker" />
          {tracker.name}
          <span className="font-normal text-muted-foreground">
            {[session, plan?.title, pages, plan ? null : formatDay(date, 'long')]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </h1>
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
                if (rules) {
                  const nextDue = defaultDue(rules, next, today)
                  setDue(nextDue)
                  setRetries((rows) =>
                    rows.map((r) =>
                      existingRetries.some((f) => f.id === r.id) ? r : { ...r, due_date: nextDue },
                    ),
                  )
                }
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
            {title}
            {optional ? (
              <>
                {' '}
                <span className="ml-1 font-sans text-small font-normal text-muted-foreground">
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
        {field && Renderer ? (
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
          />
        ) : rules ? (
          <RetryStep
            baseId={baseId}
            rows={retries}
            onRows={(rows) => {
              setRetries(rows)
              if (issue) setIssue(null)
            }}
            due={due}
            onDue={(nextDue) => {
              setDue(nextDue)
              // Retries already saved keep their own dates.
              setRetries((rows) =>
                rows.map((r) =>
                  existingRetries.some((f) => f.id === r.id) ? r : { ...r, due_date: nextDue },
                ),
              )
            }}
            hint={rules.labelHint}
            labelId={labelId}
            describedBy={describedBy}
            onSubmit={next}
          />
        ) : null}
        {issue ? (
          <p id={problemId} role="alert" className="text-destructive">
            {issue.message}
          </p>
        ) : null}
      </section>

      <nav data-flow-nav aria-label="Steps" className="flex items-center gap-3">
        {at > 0 ? (
          <Button type="button" variant="outline" onClick={back}>
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
          {field?.type === 'long_text' ? ' · Shift+Enter for a new line' : null}
        </p>
      </nav>
    </div>
  )
}
