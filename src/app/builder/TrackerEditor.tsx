import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, GripVertical, Plus, X } from 'lucide-react'
import { useId, useState, type CSSProperties, type ReactNode } from 'react'
import { sheet } from '@/components/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useTrackerWrites, type AdminTracker } from '@/lib/tracker-admin'
import { cn } from '@/lib/utils'
import { TRACKER_ACCENTS } from '@/theme/accents'
import {
  ACCENT_NAMES,
  move,
  newQuestion,
  optionsFrom,
  QUESTION_TYPES,
  removeQuestion,
  suggestMetrics,
  toDefinition,
  WITH_OPTIONS,
  type Draft,
} from '@/trackers/builder'
import type { FieldDefinition, FieldTypeName, MetricDefinition } from '@/trackers/definition'
import { Segmented } from '@/trackers/fields/controls'
import { TRACKER_ICONS, TrackerIcon } from '@/trackers/TrackerIcon'
import { LogPreview } from './LogPreview'

const ICON_NAMES: Record<string, string> = {
  calculator: 'Calculator',
  music: 'Music',
  'book-open': 'Book',
  'pen-line': 'Pen',
  brain: 'Brain',
  languages: 'Languages',
  palette: 'Palette',
  code: 'Code',
  dumbbell: 'Dumbbell',
  'list-checks': 'Checklist',
  circle: 'Circle',
}

const typeLabel = (type: FieldTypeName) =>
  QUESTION_TYPES.find((t) => t.type === type)?.label ??
  (type === 'plan_checklist' ? 'The plan’s problems' : type)

/** The editor: about, questions, a live preview, weekly numbers, then publish. */
export function TrackerEditor({
  initial,
  tracker,
  onSaved,
}: {
  initial: Draft
  tracker: AdminTracker | null
  /** After a save: the tracker's id and its question version now. */
  onSaved: (id: string, fieldVersion: number) => void
}) {
  const [draft, setDraft] = useState<Draft>(initial)
  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }))
  }
  const accent = { '--tracker': `var(--tracker-${draft.color})` } as CSSProperties

  return (
    <div style={accent} className="flex flex-col gap-12">
      <About draft={draft} update={update} tracker={tracker} />
      <Questions draft={draft} setDraft={setDraft} />
      <Preview draft={draft} />
      <Numbers draft={draft} update={update} />
      <Publish draft={draft} tracker={tracker} onSaved={onSaved} />
    </div>
  )
}

function Sheet({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={sheet(true, 'gap-5')}>
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="font-heading text-title text-foreground">
          {title}
        </h2>
        {hint ? <p className="text-small text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  )
}

function About({
  draft,
  update,
  tracker,
}: {
  draft: Draft
  update: (patch: Partial<Draft>) => void
  tracker: AdminTracker | null
}) {
  const nameId = useId()
  const iconId = useId()
  const colorId = useId()
  const todayId = useId()
  const daily = draft.cadence.type === 'daily'
  return (
    <Sheet title="About">
      <div className="flex flex-col gap-2">
        <Label htmlFor={nameId}>Name</Label>
        <Input
          id={nameId}
          value={draft.name}
          maxLength={60}
          onChange={(e) => {
            update({ name: e.target.value })
          }}
          className="max-w-sm"
        />
      </div>
      <div className="flex flex-col gap-2">
        <span id={iconId} className="text-small font-medium text-foreground">
          Icon
        </span>
        <div role="radiogroup" aria-labelledby={iconId} className="flex flex-wrap gap-2">
          {Object.keys(TRACKER_ICONS).map((icon) => (
            <label key={icon} className="relative">
              <input
                type="radio"
                name="icon"
                value={icon}
                checked={draft.icon === icon}
                aria-label={ICON_NAMES[icon] ?? icon}
                onChange={() => {
                  update({ icon })
                }}
                className="peer sr-only"
              />
              <span className="flex size-11 cursor-pointer items-center justify-center rounded-md border border-input bg-card text-tracker peer-checked:border-tracker peer-checked:ring-2 peer-checked:ring-tracker peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring hover:bg-muted">
                <TrackerIcon name={icon} className="size-5" />
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span id={colorId} className="text-small font-medium text-foreground">
          Colour
        </span>
        <div role="radiogroup" aria-labelledby={colorId} className="flex flex-wrap gap-2">
          {TRACKER_ACCENTS.map((color) => (
            <label key={color} className="relative">
              <input
                type="radio"
                name="color"
                value={color}
                checked={draft.color === color}
                onChange={() => {
                  update({ color })
                }}
                className="peer sr-only"
              />
              <span
                style={{ '--tracker': `var(--tracker-${color})` } as CSSProperties}
                className="flex h-11 cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 text-small text-foreground peer-checked:border-foreground peer-checked:ring-1 peer-checked:ring-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring hover:bg-muted"
              >
                <span aria-hidden className="size-4 rounded-sm bg-tracker" />
                {ACCENT_NAMES[color]}
              </span>
            </label>
          ))}
        </div>
      </div>
      {daily && draft.display !== 'task_list' ? (
        <div className="flex flex-col gap-2">
          <span id={todayId} className="text-small font-medium text-foreground">
            On Today
          </span>
          <Segmented
            name="display"
            options={[
              { key: 'inline', label: 'Right on its card' },
              { key: 'flow', label: 'Its own log, a question at a time' },
            ]}
            value={draft.display === 'inline_on_today_card' ? 'inline' : 'flow'}
            onChange={(key) => {
              update({ display: key === 'inline' ? 'inline_on_today_card' : undefined })
            }}
            labelId={todayId}
          />
          <p className="text-small text-muted-foreground">
            On its card suits a check-in of a tap and a few words, like violin.
          </p>
        </div>
      ) : (
        <p className="text-small text-muted-foreground">
          {draft.display === 'task_list'
            ? 'Tasks the admin adds on the Tasks screen, ticked off on Today.'
            : 'Follows a plan: one log per planned session (the Plan screen edits the sessions).'}
          {tracker ? ` Its link name is “${tracker.slug}”.` : null}
        </p>
      )}
    </Sheet>
  )
}

function Questions({
  draft,
  setDraft,
}: {
  draft: Draft
  setDraft: (update: (d: Draft) => Draft) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const keys = draft.fields.map((f) => f.key)
  const replace = (index: number, field: FieldDefinition) => {
    setDraft((d) => ({ ...d, fields: d.fields.map((f, i) => (i === index ? field : f)) }))
  }
  const reorder = (from: number, to: number) => {
    setDraft((d) => ({ ...d, fields: move(d.fields, from, to) }))
  }
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    reorder(keys.indexOf(String(active.id)), keys.indexOf(String(over.id)))
  }

  return (
    <Sheet
      title="Questions"
      hint="Asked in this order. Drag one by its handle, or move it with the arrows."
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={keys} strategy={verticalListSortingStrategy}>
          <ol aria-label="Questions" className="flex flex-col gap-4">
            {draft.fields.map((field, index) => (
              <QuestionEditor
                key={field.key}
                field={field}
                index={index}
                count={draft.fields.length}
                saved={draft.savedKeys.includes(field.key)}
                earlier={draft.fields.slice(0, index)}
                onChange={(next) => {
                  replace(index, next)
                }}
                onMove={(to) => {
                  reorder(index, to)
                }}
                onRemove={() => {
                  setDraft((d) => removeQuestion(d, field.key))
                }}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <AddQuestion
        onAdd={(type, label) => {
          setDraft((d) => ({ ...d, fields: [...d.fields, newQuestion(type, label, d)] }))
        }}
      />
    </Sheet>
  )
}

function QuestionEditor({
  field,
  index,
  count,
  saved,
  earlier,
  onChange,
  onMove,
  onRemove,
}: {
  field: FieldDefinition
  index: number
  count: number
  saved: boolean
  earlier: FieldDefinition[]
  onChange: (field: FieldDefinition) => void
  onMove: (to: number) => void
  onRemove: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.key })
  const labelId = useId()
  const helpId = useId()
  const optionsId = useId()
  const whenId = useId()
  const typeId = useId()
  const minId = useId()
  const maxId = useId()
  const [lines, setLines] = useState(() => (field.options ?? []).map((o) => o.label).join('\n'))
  const position = `Question ${String(index + 1)}`
  const conditions = earlier.filter((f) => f.type === 'yes_no' || f.type === 'checkbox')
  const condition = field.showIf ? Object.entries(field.showIf)[0] : undefined
  const whenValue = condition ? `${condition[0]}:${String(condition[1])}` : 'always'
  const planOnly = field.type === 'plan_checklist' || Boolean(field.optionsFrom)

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      aria-label={`${position}: ${field.label || 'untitled'}`}
      className={cn(
        'flex flex-col gap-4 border-l-2 border-tracker py-1 pl-4',
        isDragging && 'relative z-10 bg-background',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Drag ${position}`}
            className="flex size-8 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
          >
            <GripVertical aria-hidden className="size-4" />
          </button>
          <span className="text-small font-medium text-foreground">{position}</span>
          <span className="text-small text-muted-foreground">· {typeLabel(field.type)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Move ${position} up`}
            disabled={index === 0}
            onClick={() => {
              onMove(index - 1)
            }}
          >
            <ArrowUp aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Move ${position} down`}
            disabled={index === count - 1}
            onClick={() => {
              onMove(index + 1)
            }}
          >
            <ArrowDown aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove ${position}`}
            disabled={count === 1}
            onClick={onRemove}
          >
            <X aria-hidden />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={labelId}>The question</Label>
        <Input
          id={labelId}
          value={field.label}
          onChange={(e) => {
            onChange({ ...field, label: e.target.value })
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={helpId}>A hint under it (optional)</Label>
        <Input
          id={helpId}
          value={field.help ?? ''}
          onChange={(e) => {
            onChange({ ...field, help: e.target.value || undefined })
          }}
        />
      </div>

      {!saved && !planOnly ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={typeId}>Answered as</Label>
          <select
            id={typeId}
            value={field.type}
            onChange={(e) => {
              const type = e.target.value as FieldTypeName
              const next: FieldDefinition = {
                key: field.key,
                type,
                label: field.label,
                required: field.required,
              }
              if (field.help) next.help = field.help
              if (field.showIf) next.showIf = field.showIf
              if (WITH_OPTIONS.has(type)) {
                next.options = field.options?.length
                  ? field.options
                  : optionsFrom('First choice\nSecond choice')
                setLines((next.options ?? []).map((o) => o.label).join('\n'))
              }
              onChange(next)
            }}
            className="h-11 max-w-sm rounded-md border border-input bg-card px-3 text-body text-foreground"
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-small text-muted-foreground">
          {planOnly
            ? 'Its choices come from each planned session.'
            : 'Its kind of answer stays: logs already use it.'}
        </p>
      )}

      {WITH_OPTIONS.has(field.type) && !planOnly ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={optionsId}>Choices, one per line</Label>
          <Textarea
            id={optionsId}
            rows={3}
            value={lines}
            onChange={(e) => {
              setLines(e.target.value)
              // Keep a choice's key when its label stays, so earlier answers still read.
              const byLabel = new Map((field.options ?? []).map((o) => [o.label, o.key]))
              const fresh = optionsFrom(e.target.value).map((o) => ({
                ...o,
                key: byLabel.get(o.label) ?? o.key,
              }))
              onChange({ ...field, options: fresh })
            }}
            className="max-w-sm"
          />
        </div>
      ) : null}

      {field.type === 'number' ? (
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={minId}>Smallest (optional)</Label>
            <Input
              id={minId}
              type="number"
              value={field.min ?? ''}
              onChange={(e) => {
                const v = e.target.value
                onChange({ ...field, min: v === '' ? undefined : Number(v) })
              }}
              className="w-32"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={maxId}>Largest (optional)</Label>
            <Input
              id={maxId}
              type="number"
              value={field.max ?? ''}
              onChange={(e) => {
                const v = e.target.value
                onChange({ ...field, max: v === '' ? undefined : Number(v) })
              }}
              className="w-32"
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex items-center gap-2 text-foreground">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => {
              onChange({ ...field, required: e.target.checked })
            }}
            className="size-4 accent-primary"
          />
          Needs an answer
        </label>
        {conditions.length > 0 && !planOnly ? (
          <div className="flex items-center gap-2">
            <Label htmlFor={whenId}>Asked</Label>
            <select
              id={whenId}
              value={whenValue}
              onChange={(e) => {
                const value = e.target.value
                const next: FieldDefinition = { ...field }
                if (value === 'always') delete next.showIf
                else {
                  const [key, answer] = value.split(':')
                  next.showIf = { [key ?? '']: answer === 'true' }
                }
                onChange(next)
              }}
              className="h-10 rounded-md border border-input bg-card px-2 text-small text-foreground"
            >
              <option value="always">always</option>
              {conditions.flatMap((c) => [
                <option key={`${c.key}:true`} value={`${c.key}:true`}>
                  when “{c.label}” is yes
                </option>,
                <option key={`${c.key}:false`} value={`${c.key}:false`}>
                  when “{c.label}” is no
                </option>,
              ])}
            </select>
          </div>
        ) : null}
      </div>
    </li>
  )
}

function AddQuestion({ onAdd }: { onAdd: (type: FieldTypeName, label: string) => void }) {
  const labelId = useId()
  const typeId = useId()
  const [label, setLabel] = useState('')
  const [type, setType] = useState<FieldTypeName>('yes_no')
  const [missing, setMissing] = useState(false)
  return (
    <form
      aria-label="Add a question"
      noValidate
      className="flex flex-col gap-3 border-t border-border pt-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (!label.trim()) {
          setMissing(true)
          return
        }
        onAdd(type, label.trim())
        setLabel('')
        setMissing(false)
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-1 flex-col gap-2">
          <Label htmlFor={labelId}>A new question</Label>
          <Input
            id={labelId}
            value={label}
            placeholder="Did you warm up first?"
            aria-invalid={missing}
            onChange={(e) => {
              setLabel(e.target.value)
              setMissing(false)
            }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={typeId}>Answered as</Label>
          <select
            id={typeId}
            value={type}
            onChange={(e) => {
              setType(e.target.value as FieldTypeName)
            }}
            className="h-11 rounded-md border border-input bg-card px-3 text-body text-foreground"
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">
          <Plus aria-hidden />
          Add
        </Button>
      </div>
      {missing ? <p className="text-small text-destructive">Write the question first.</p> : null}
    </form>
  )
}

function Preview({ draft }: { draft: Draft }) {
  return (
    <Sheet title="Preview" hint="The student’s log, as they’d see it. Try it: nothing is saved.">
      <LogPreview
        key={JSON.stringify(draft.fields)}
        name={draft.name}
        icon={draft.icon}
        color={draft.color}
        fields={draft.fields}
      />
    </Sheet>
  )
}

/** A metric's rule in words, with questions named by their labels. */
function describe(metric: MetricDefinition, fields: FieldDefinition[]): string {
  const name = (key: unknown) => {
    const label = fields.find((f) => f.key === key)?.label
    return label ? `“${label}”` : String(key)
  }
  const where =
    typeof metric.where === 'string'
      ? metric.where
          .split(/\s+or\s+/)
          .map(name)
          .join(' or ')
      : ''
  switch (metric.type) {
    case 'days_per_week':
      return `Days a week with ${where} yes`
    case 'streak':
      return `Days in a row with ${where} yes`
    case 'count_where':
      return `Logs a week with ${where} yes`
    case 'sum':
      return `${name(metric.field)} added up each week`
    case 'avg':
      return `The week’s average of ${name(metric.field)}`
    case 'ratio':
      return 'A share worked out from the plan (kept as it is)'
  }
}

function Numbers({ draft, update }: { draft: Draft; update: (patch: Partial<Draft>) => void }) {
  const suggestions = suggestMetrics(draft)
  return (
    <Sheet
      title="Weekly numbers"
      hint="What Overview shows for each week, beside the week before. Pick from what the questions allow."
    >
      {draft.metrics.length === 0 ? (
        <p className="text-muted-foreground">None yet.</p>
      ) : (
        <ul aria-label="Weekly numbers" className="flex flex-col border-t border-border">
          {draft.metrics.map((metric, index) => (
            <MetricRow
              key={metric.key}
              metric={metric}
              text={describe(metric, draft.fields)}
              onLabel={(label) => {
                update({
                  metrics: draft.metrics.map((m, i) => (i === index ? { ...m, label } : m)),
                })
              }}
              onRemove={() => {
                update({ metrics: draft.metrics.filter((_, i) => i !== index) })
              }}
            />
          ))}
        </ul>
      )}
      {suggestions.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-small text-muted-foreground">Could also show</h3>
          <ul aria-label="Suggested numbers" className="flex flex-col gap-2">
            {suggestions.map((s) => (
              <li
                key={s.metric.key}
                className="flex flex-wrap items-center justify-between gap-x-4"
              >
                <span className="text-foreground">
                  {s.metric.label}{' '}
                  <span className="text-small text-muted-foreground">· {s.why}</span>
                </span>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-0"
                  onClick={() => {
                    update({ metrics: [...draft.metrics, s.metric] })
                  }}
                >
                  Add<span className="sr-only"> {s.metric.label}</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Sheet>
  )
}

function MetricRow({
  metric,
  text,
  onLabel,
  onRemove,
}: {
  metric: MetricDefinition
  text: string
  onLabel: (label: string) => void
  onRemove: () => void
}) {
  const id = useId()
  return (
    <li className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-border py-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={id} className="sr-only">
          Name of the number: {text}
        </Label>
        <Input
          id={id}
          value={metric.label}
          onChange={(e) => {
            onLabel(e.target.value)
          }}
          className="h-9 w-56"
        />
        <span className="text-small text-muted-foreground">{text}</span>
      </div>
      <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={onRemove}>
        Remove<span className="sr-only"> {metric.label}</span>
      </Button>
    </li>
  )
}

function Publish({
  draft,
  tracker,
  onSaved,
}: {
  draft: Draft
  tracker: AdminTracker | null
  onSaved: (id: string, fieldVersion: number) => void
}) {
  const { save } = useTrackerWrites()
  const version = tracker?.fieldVersion ?? 1
  const result = toDefinition(draft, version)
  const changedQuestions =
    tracker !== null &&
    JSON.stringify(tracker.fields) !==
      JSON.stringify(result.ok ? result.definition.fields : draft.fields)

  return (
    <Sheet
      title={tracker ? 'Save' : 'Publish'}
      hint={
        tracker
          ? changedQuestions
            ? `The questions changed: this becomes version ${String(version + 1)}. Logs already made keep the questions they were made with.`
            : 'Only the name, look or numbers changed: the questions stay at this version.'
          : 'Once it’s published, give it to a student on People.'
      }
    >
      {result.ok ? null : (
        <ul aria-label="Still to fix" className="flex flex-col gap-1">
          {result.issues.map((issue) => (
            <li key={`${issue.where}:${issue.message}`} className="text-small text-destructive">
              {issue.where}: {issue.message}
            </li>
          ))}
        </ul>
      )}
      <div>
        <Button
          type="button"
          disabled={!result.ok || save.isPending}
          onClick={() => {
            if (!result.ok) return
            save.mutate(
              { id: tracker?.id ?? null, definition: result.definition },
              {
                onSuccess: (saved) => {
                  onSaved(saved.id, saved.fieldVersion)
                },
              },
            )
          }}
        >
          {save.isPending ? 'Saving…' : tracker ? 'Save changes' : 'Publish'}
        </Button>
      </div>
      {save.error ? (
        <p role="alert" className="text-small text-destructive">
          {save.error.message}
        </p>
      ) : null}
    </Sheet>
  )
}
