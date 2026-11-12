import { Plus } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatDay } from '@/lib/dates'
import { usePlanEdits } from '@/lib/plan-admin'
import type { PlanItem } from '@/trackers/plan'
import { checkSession, readPasted, toPlanItems, type NewSession } from '@/trackers/plan-paste'

/**
 * Adding sessions to a plan (any plan tracker, not only math): one with a short form, or
 * a list pasted from a spreadsheet, read and checked row by row before anything is added.
 * New sessions number on from the plan's last.
 */
export function AddSessions({
  assignmentId,
  items,
  today,
  onAdded,
}: {
  assignmentId: string
  items: readonly PlanItem[]
  today: string
  onAdded: (text: string) => void
}) {
  const headingId = useId()
  const { add } = usePlanEdits(assignmentId)
  const save = (sessions: NewSession[], then: () => void) => {
    add.mutate(toPlanItems(assignmentId, sessions, items), {
      onSuccess: () => {
        then()
        const first = sessions[0]
        onAdded(
          sessions.length === 1 && first
            ? `Added ${first.topic} on ${formatDay(first.date, 'long')}.`
            : `Added ${String(sessions.length)} sessions.`,
        )
      },
    })
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-5 border-t-2 border-tracker pt-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="font-heading text-title text-foreground">
          Add sessions
        </h2>
        <p className="text-small text-muted-foreground">
          One at a time, or a list pasted from a spreadsheet. They number on from the last.
        </p>
      </div>
      <OneSession today={today} busy={add.isPending} onAdd={save} />
      <PasteList busy={add.isPending} onAdd={save} />
      {add.error ? (
        <p role="alert" className="text-small text-destructive">
          {add.error.message}
        </p>
      ) : null}
    </section>
  )
}

function OneSession({
  today,
  busy,
  onAdd,
}: {
  today: string
  busy: boolean
  onAdd: (sessions: NewSession[], then: () => void) => void
}) {
  const ids = { date: useId(), topic: useId(), pages: useId(), problems: useId() }
  const [form, setForm] = useState({ date: today, topic: '', pages: '', problems: '' })
  const [problem, setProblem] = useState<string | null>(null)
  const set = (key: keyof typeof form) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setProblem(null)
  }
  return (
    <form
      aria-label="Add one session"
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        const checked = checkSession(form)
        if ('problem' in checked) {
          setProblem(checked.problem)
          return
        }
        onAdd([checked.session], () => {
          setForm({ date: form.date, topic: '', pages: '', problems: '' })
        })
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[auto_1fr_auto]">
        <div className="flex flex-col gap-2">
          <Label htmlFor={ids.date}>Day</Label>
          <Input
            id={ids.date}
            type="date"
            value={form.date}
            onChange={(e) => {
              set('date')(e.target.value)
            }}
            className="w-44"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={ids.topic}>Topic</Label>
          <Input
            id={ids.topic}
            value={form.topic}
            maxLength={120}
            onChange={(e) => {
              set('topic')(e.target.value)
            }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={ids.pages}>Pages (optional)</Label>
          <Input
            id={ids.pages}
            value={form.pages}
            placeholder="32-35"
            inputMode="numeric"
            onChange={(e) => {
              set('pages')(e.target.value)
            }}
            className="w-32 tabular-nums"
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={ids.problems}>Problems (optional), one per line</Label>
        <Textarea
          id={ids.problems}
          rows={2}
          value={form.problems}
          placeholder="p. 32 #1"
          onChange={(e) => {
            set('problems')(e.target.value)
          }}
          className="max-w-sm"
        />
        <p className="text-small text-muted-foreground">
          Listed problems become the session’s checkboxes for what was hard.
        </p>
      </div>
      {problem ? <p className="text-small text-destructive">{problem}</p> : null}
      <div>
        <Button type="submit" variant="outline" disabled={busy}>
          <Plus aria-hidden />
          Add the session
        </Button>
      </div>
    </form>
  )
}

function PasteList({
  busy,
  onAdd,
}: {
  busy: boolean
  onAdd: (sessions: NewSession[], then: () => void) => void
}) {
  const id = useId()
  const [text, setText] = useState('')
  const rows = text.trim() ? readPasted(text) : []
  const good = rows.flatMap((r) => (r.session ? [r.session] : []))
  const bad = rows.filter((r) => r.problem)
  return (
    <details className="group flex flex-col gap-3 border-t border-border pt-4">
      <summary className="cursor-pointer text-body font-medium text-foreground">
        Paste a list
      </summary>
      <form
        aria-label="Paste a list of sessions"
        noValidate
        className="mt-3 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (good.length === 0 || bad.length > 0) return
          onAdd(good, () => {
            setText('')
          })
        }}
      >
        <Label htmlFor={id}>One session per row: day, topic, pages, problems</Label>
        <Textarea
          id={id}
          rows={5}
          value={text}
          spellCheck={false}
          placeholder={'2026-12-07\tFractions\t32-35\tp. 32 #1; p. 33 #4\n12/8/2026, Decimals, 36'}
          onChange={(e) => {
            setText(e.target.value)
          }}
          className="tabular-nums"
        />
        <p className="text-small text-muted-foreground">
          Copied cells (tabs) or commas. Pages and problems can be left out; problems go together,
          split by semicolons.
        </p>
        {rows.length > 0 ? (
          <div aria-live="polite" className="flex flex-col gap-1 text-small">
            <p className="text-foreground">
              {good.length} {good.length === 1 ? 'session' : 'sessions'} read
              {bad.length > 0 ? `, ${String(bad.length)} to fix:` : '.'}
            </p>
            {bad.map((r) => (
              <p key={r.line} className="text-destructive">
                Row {r.line}: {r.problem}
              </p>
            ))}
          </div>
        ) : null}
        <div>
          <Button
            type="submit"
            variant="outline"
            disabled={busy || good.length === 0 || bad.length > 0}
          >
            <Plus aria-hidden />
            {good.length > 0 ? `Add ${String(good.length)} sessions` : 'Add the sessions'}
          </Button>
        </div>
      </form>
    </details>
  )
}
