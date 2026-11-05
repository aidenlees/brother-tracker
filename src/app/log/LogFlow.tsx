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
import { formatDay } from '@/lib/dates'
import { useOutbox } from '@/lib/outbox/outbox-context'
import type { EntryView } from '@/lib/outbox/overlay'
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
import { pageLabel, sessionLabel, type PlanItem } from '@/trackers/plan'
import { TrackerIcon } from '@/trackers/TrackerIcon'

/** How long after the last change the draft is written to the device. */
const AUTOSAVE_MS = 300

type Step = { kind: 'field'; field: FieldDefinition }

/**
 * The log flow (CLAUDE.md, "Log session"): one field per screen, keyboard first. Enter
 * moves on (Shift+Enter starts a new line in long answers), the tally keys work without
 * clicking, and every change is kept on the device so leaving loses nothing.
 */
export function LogFlow({
  tracker,
  plan,
  existing,
  draft,
}: {
  tracker: Tracker
  plan: PlanItem | null
  existing: EntryView | undefined
  draft: Draft
}) {
  const outbox = useOutbox()
  const navigate = useNavigate()
  const baseId = useId()
  const details = plan?.details ?? null

  const [data, setData] = useState<EntryData>(draft.data)
  const [index, setIndex] = useState(draft.step)
  const [issue, setIssue] = useState<EntryIssue | null>(null)
  const [saving, setSaving] = useState(false)

  const steps: Step[] = useMemo(
    () => shownFields(tracker.fields, data, details).map((field) => ({ kind: 'field', field })),
    [tracker.fields, data, details],
  )
  const at = Math.min(index, steps.length - 1)
  const step = steps[at]
  const last = at === steps.length - 1

  // Keep the draft on the device, a moment after each change.
  const finished = useRef(false)
  useEffect(() => {
    if (finished.current) return
    const timer = window.setTimeout(() => {
      if (finished.current) return
      void saveDraft({ ...draft, data, step: at, updatedAt: new Date().toISOString() })
    }, AUTOSAVE_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [draft, data, at])

  /** The current field's problem, if any, judged exactly as the database will judge it. */
  function problemWith(field: FieldDefinition): EntryIssue | null {
    const result = cleanEntry(tracker.fields, data, details)
    return result.ok ? null : (result.issues.find((i) => i.key === field.key) ?? null)
  }

  async function save() {
    const result = cleanEntry(tracker.fields, data, details)
    if (!result.ok) {
      const first = result.issues[0]
      const where = steps.findIndex((s) => s.field.key === first?.key)
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
        patch: { data: result.data, field_version: tracker.field_version },
      })
    } else {
      await outbox.enqueue({
        kind: 'entry.create',
        row: {
          id: draft.entryId,
          assignment_id: draft.assignmentId,
          plan_item_id: draft.planItemId,
          field_version: tracker.field_version,
          date: draft.date,
          data: result.data,
          owner_id: outbox.userId,
        },
      })
    }
    await deleteDraft(draft.key)
    void navigate('/today', { state: { saved: existing?.id ?? draft.entryId } })
  }

  function next() {
    if (!step || saving) return
    const problem = problemWith(step.field)
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
  const field = step.field
  const { Renderer } = FIELD_REGISTRY[field.type]
  const labelId = `${baseId}-label`
  const helpId = `${baseId}-help`
  const problemId = `${baseId}-problem`
  const help = field.rotatingPrompts ? promptFor(field, details) : field.help
  const session = plan ? sessionLabel(plan.details) : null
  const pages = plan ? pageLabel(plan.details) : null

  return (
    <div
      style={{ '--tracker': `var(--tracker-${tracker.color})` } as CSSProperties}
      className="flex max-w-xl flex-col gap-8"
    >
      <header className="flex flex-col gap-3">
        <Link
          to="/today"
          className="flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Today (your answers are kept)
        </Link>
        <h1 className="flex flex-wrap items-baseline gap-x-2 text-base font-sans font-medium text-foreground">
          <TrackerIcon name={tracker.icon} className="size-4 self-center text-tracker" />
          {tracker.name}
          <span className="font-normal text-muted-foreground">
            {[session, plan?.title, pages, plan ? null : formatDay(draft.date, 'long')]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </h1>
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
          <p className="text-sm text-muted-foreground tabular-nums">
            {at + 1} of {steps.length}
          </p>
        </div>
      </header>

      <section aria-labelledby={labelId} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 id={labelId} className="text-3xl leading-tight text-foreground">
            {field.label}
            {field.required ? null : (
              <>
                {' '}
                <span className="ml-1 font-sans text-base text-muted-foreground">optional</span>
              </>
            )}
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
          describedBy={
            [help ? helpId : null, issue ? problemId : null].filter(Boolean).join(' ') || undefined
          }
          invalid={issue !== null}
          autoFocus
          hotkeys
          onSubmit={next}
          placeholder={field.rotatingPrompts ? '' : undefined}
        />
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
        <p className="hidden text-sm text-muted-foreground sm:block">
          <kbd className="font-sans">Enter</kbd>
          {field.type === 'long_text' ? ' · Shift+Enter for a new line' : null}
        </p>
      </nav>
    </div>
  )
}
