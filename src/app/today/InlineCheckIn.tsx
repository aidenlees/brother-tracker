import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatDay } from '@/lib/dates'
import { useOutbox } from '@/lib/outbox/outbox-context'
import type { EntryView } from '@/lib/outbox/overlay'
import { queuePhotos } from '@/lib/outbox/queue-photos'
import type { Assignment, Tracker } from '@/lib/student-data'
import type { FieldDefinition, FieldTypeName } from '@/trackers/definition'
import {
  cleanEntry,
  initialData,
  promptFor,
  shownFields,
  type EntryData,
  type EntryIssue,
} from '@/trackers/entry'
import { FIELD_REGISTRY } from '@/trackers/fields/registry'
import { SavedNote } from './TrackerCard'

/** Answers that save on their own once the entry is complete: a tap, not typing. */
const SAVES_ON_CHOICE: ReadonlySet<FieldTypeName> = new Set([
  'yes_no',
  'select',
  'rating_1_5',
  'checkbox',
])

/**
 * A daily tracker logged right on its card (display: inline_on_today_card), in about
 * ten seconds: a tap, and a few words when they're asked for. Its fields come from the
 * tracker, so any daily tracker can be shown this way.
 */
export function InlineCheckIn({
  assignment,
  tracker,
  entries,
  today,
}: {
  assignment: Assignment
  tracker: Tracker
  entries: EntryView[]
  today: string
}) {
  const outbox = useOutbox()
  const baseId = useId()
  const todays = entries.find((e) => e.date === today && e.plan_item_id === null)
  const [editing, setEditing] = useState(false)
  const [data, setData] = useState<EntryData>(() => initialData(tracker.fields, null))
  const [issues, setIssues] = useState<EntryIssue[]>([])
  /** What was just saved, shown until the outbox echoes it back as today's entry. */
  const [justSaved, setJustSaved] = useState<EntryData | null>(null)

  if (today < assignment.start_date) {
    return (
      <p className="text-muted-foreground">Starts {formatDay(assignment.start_date, 'long')}.</p>
    )
  }

  async function save(next: EntryData) {
    const result = cleanEntry(tracker.fields, next, null)
    if (!result.ok) {
      setIssues(result.issues)
      return
    }
    setIssues([])
    const entryId = todays?.id ?? crypto.randomUUID()
    if (todays) {
      await outbox.enqueue({
        kind: 'entry.update',
        id: todays.id,
        patch: { data: result.data, field_version: tracker.field_version },
      })
    } else {
      await outbox.enqueue({
        kind: 'entry.create',
        row: {
          id: entryId,
          assignment_id: assignment.id,
          plan_item_id: null,
          field_version: tracker.field_version,
          date: today,
          data: result.data,
          owner_id: outbox.userId,
        },
      })
    }
    await queuePhotos(outbox.enqueue, tracker.fields, result.data, entryId, outbox.userId)
    setJustSaved(result.data)
    setEditing(false)
  }

  function change(field: FieldDefinition, value: unknown) {
    const next = { ...data, [field.key]: value }
    setData(next)
    if (issues.length > 0) setIssues([])
    if (SAVES_ON_CHOICE.has(field.type) && cleanEntry(tracker.fields, next, null).ok) {
      void save(next)
    }
  }

  const saved = todays?.data ?? justSaved
  if (saved && !editing) {
    return (
      <div className="flex flex-col gap-4">
        <dl className="flex flex-col gap-2">
          {shownFields(tracker.fields, saved, null)
            .filter((field) => saved[field.key] !== undefined)
            .map((field) => (
              <div key={field.key} className="flex flex-col">
                <dt className="text-small text-muted-foreground">{field.label}</dt>
                <dd className="text-foreground">
                  {FIELD_REGISTRY[field.type].summary(saved[field.key], field)}
                </dd>
              </div>
            ))}
        </dl>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SavedNote
            sync={todays?.sync ?? 'pending'}
            reason={todays?.reason}
            fresh={justSaved !== null}
          />
          <Button
            variant="link"
            size="sm"
            className="h-auto px-0"
            onClick={() => {
              setData({ ...initialData(tracker.fields, null), ...saved })
              setIssues([])
              setEditing(true)
            }}
          >
            Change
          </Button>
        </div>
      </div>
    )
  }

  const shown = shownFields(tracker.fields, data, null)
  const typed = shown.some((field) => !SAVES_ON_CHOICE.has(field.type))
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        void save(data)
      }}
    >
      {shown.map((field, index) => {
        const { Renderer } = FIELD_REGISTRY[field.type]
        const labelId = `${baseId}-${field.key}`
        const issue = issues.find((i) => i.key === field.key)
        return (
          <div key={field.key} className="flex flex-col gap-2">
            <p id={labelId} className="font-medium text-foreground">
              {field.label}
            </p>
            <Renderer
              field={field}
              value={data[field.key] ?? null}
              onChange={(value) => {
                change(field, value)
              }}
              labelId={labelId}
              describedBy={issue ? `${labelId}-problem` : undefined}
              invalid={issue !== undefined}
              // A field that appears after an answer (e.g. the focus after "Yes") takes the cursor.
              autoFocus={index > 0}
              onSubmit={() => {
                void save(data)
              }}
              placeholder={promptFor(field, null)}
            />
            {issue ? (
              <p id={`${labelId}-problem`} className="text-small text-destructive">
                {issue.message}
              </p>
            ) : null}
          </div>
        )
      })}
      {typed || editing ? (
        <div className="flex gap-2">
          {typed ? <Button type="submit">Save</Button> : null}
          {editing ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(false)
              }}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      ) : null}
    </form>
  )
}
