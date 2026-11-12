import { ArrowLeft, ArrowRight, Check, RotateCcw } from 'lucide-react'
import { useId, useMemo, useState, type CSSProperties } from 'react'
import { Button } from '@/components/ui/button'
import type { TrackerAccent } from '@/theme/accents'
import type { FieldDefinition } from '@/trackers/definition'
import { cleanEntry, initialData, shownFields, type EntryData } from '@/trackers/entry'
import { FIELD_REGISTRY } from '@/trackers/fields/registry'
import { TrackerIcon } from '@/trackers/TrackerIcon'

/**
 * The student's log as the draft would make it: one question per step, the same
 * renderers and the same checks as the real log (cleanEntry), nothing saved. Its own
 * keys stay inside it: Enter moves on here, never on the page around it.
 */
export function LogPreview({
  name,
  icon,
  color,
  fields,
}: {
  name: string
  icon: string
  color: TrackerAccent
  fields: FieldDefinition[]
}) {
  const baseId = useId()
  const [data, setData] = useState<EntryData>(() => initialData(fields, null))
  const [index, setIndex] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)
  const steps = useMemo(() => shownFields(fields, data, null), [fields, data])
  const at = Math.min(index, Math.max(0, steps.length - 1))
  const field = steps[at]

  const restart = () => {
    setData(initialData(fields, null))
    setIndex(0)
    setProblem(null)
    setFinished(false)
  }
  const next = () => {
    if (!field) return
    const result = cleanEntry(fields, data, null)
    const issue = result.ok ? null : result.issues.find((i) => i.key === field.key)
    if (issue) {
      setProblem(issue.message)
      return
    }
    setProblem(null)
    if (at >= steps.length - 1) setFinished(true)
    else setIndex(at + 1)
  }

  const accent = { '--tracker': `var(--tracker-${color})` } as CSSProperties
  if (!field) {
    return <p className="text-muted-foreground">Add a question to see the log.</p>
  }
  if (finished) {
    return (
      <div style={accent} className="flex flex-col items-start gap-3">
        <p className="flex items-center gap-2 text-foreground">
          <Check aria-hidden className="size-5 text-tracker" />
          That’s the whole log: {String(steps.length)}{' '}
          {steps.length === 1 ? 'question' : 'questions'}. Nothing was saved.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={restart}>
          <RotateCcw aria-hidden />
          Try it again
        </Button>
      </div>
    )
  }

  const labelId = `${baseId}-label`
  const problemId = `${baseId}-problem`
  const { Renderer } = FIELD_REGISTRY[field.type]
  return (
    <div
      style={accent}
      className="flex flex-col gap-6 rounded-lg border border-border bg-card p-5 sm:p-6"
      onKeyDown={(e) => {
        e.stopPropagation()
      }}
    >
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-small text-foreground">
          <TrackerIcon name={icon} className="size-4 text-tracker" />
          {name || 'New tracker'}
        </p>
        <div className="flex items-center gap-3">
          <div
            className="h-1 flex-1 overflow-hidden rounded-sm bg-muted"
            role="progressbar"
            aria-label="Preview progress"
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-valuenow={at + 1}
          >
            <div
              className="h-full bg-tracker"
              style={{ width: `${String(((at + 1) / steps.length) * 100)}%` }}
            />
          </div>
          <p className="text-small text-muted-foreground tabular-nums">
            {at + 1} of {steps.length}
          </p>
        </div>
      </div>
      <section aria-labelledby={labelId} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h3 id={labelId} className="font-heading text-title text-foreground">
            {field.label}
          </h3>
          {field.help ? <p className="text-muted-foreground">{field.help}</p> : null}
        </div>
        <Renderer
          key={field.key}
          field={field}
          value={data[field.key] ?? null}
          onChange={(value) => {
            setData((d) => ({ ...d, [field.key]: value }))
            setProblem(null)
          }}
          labelId={labelId}
          describedBy={problem ? problemId : undefined}
          invalid={problem !== null}
          onSubmit={next}
          plan={null}
        />
        {problem ? (
          <p id={problemId} role="alert" className="text-destructive">
            {problem}
          </p>
        ) : null}
      </section>
      <div className="flex items-center gap-3">
        {at > 0 ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setProblem(null)
              setIndex(at - 1)
            }}
          >
            <ArrowLeft aria-hidden />
            Back
          </Button>
        ) : null}
        <Button type="button" onClick={next}>
          {at >= steps.length - 1 ? (
            <>
              <Check aria-hidden />
              Finish
            </>
          ) : (
            <>
              Next
              <ArrowRight aria-hidden />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
