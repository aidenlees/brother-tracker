import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { EmptyNote, Page } from '@/components/Page'
import { formatDay } from '@/lib/dates'
import { useOutbox } from '@/lib/outbox/outbox-context'
import { isEditable, type EntryView, type FollowupView } from '@/lib/outbox/overlay'
import { draftKey, getDraft } from '@/lib/outbox/store'
import type { Draft } from '@/lib/outbox/types'
import { useStudentData, type Tracker } from '@/lib/student-data'
import { useToday } from '@/lib/use-today'
import { initialData } from '@/trackers/entry'
import type { PlanItem } from '@/trackers/plan'
import { LockedEntry } from './LockedEntry'
import { LogFlow } from './LogFlow'

/**
 * Log session: one plan item (/log/:assignment/:planItem) or one day of a daily tracker
 * (/log/:assignment?date=YYYY-MM-DD). Resumes a draft if there is one, edits the entry if
 * it exists, and starts fresh otherwise.
 */
export function LogPage() {
  const { assignmentId = '', planItemId } = useParams()
  const [search] = useSearchParams()
  const today = useToday()
  const data = useStudentData()
  const outbox = useOutbox()

  const assignment = data.assignments.find((a) => a.id === assignmentId)
  const tracker = assignment?.tracker ?? null
  const plan = planItemId ? data.planItems.find((i) => i.id === planItemId) : undefined
  const date = search.get('date') ?? today
  const existing = assignment
    ? planItemId
      ? data.entries.find((e) => e.assignment_id === assignment.id && e.plan_item_id === planItemId)
      : data.entries.find(
          (e) => e.assignment_id === assignment.id && e.plan_item_id === null && e.date === date,
        )
    : undefined
  const existingRetries = existing
    ? data.followups.filter((f) => f.entry_id === existing.id && f.status === 'open')
    : []
  const key = draftKey(outbox.userId, assignmentId, planItemId ?? null, date)

  // The draft to work on: the saved one, or a fresh one once the data is here.
  const [draft, setDraft] = useState<Draft | null>(null)
  const ready = data.status === 'ready' && tracker !== null
  useEffect(() => {
    if (!ready || draft?.key === key) return
    let current = true
    void getDraft(key).then((saved) => {
      if (!current) return
      setDraft(
        saved ??
          freshDraft(
            key,
            outbox.userId,
            assignmentId,
            tracker,
            plan,
            date,
            existing,
            existingRetries,
          ),
      )
    })
    return () => {
      current = false
    }
    // Only the first draft for this key matters; later data changes don't replace it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key, draft?.key])

  if (data.status === 'loading') {
    return (
      <p role="status" className="text-muted-foreground">
        Loading…
      </p>
    )
  }
  if (data.status === 'error') {
    return (
      <Problem title="Log session">Couldn’t load your trackers. Check your connection.</Problem>
    )
  }
  if (!assignment || !tracker || (planItemId && !plan)) {
    return <Problem title="Log session">This session isn’t one of yours.</Problem>
  }
  if (date > today || date < assignment.start_date) {
    return (
      <Problem title={tracker.name}>
        You can log days from {formatDay(assignment.start_date, 'long')} up to today.
      </Problem>
    )
  }
  if (existing && !isEditable(existing)) {
    return <LockedEntry tracker={tracker} plan={plan ?? null} entry={existing} />
  }
  if (!draft) {
    return (
      <p role="status" className="text-muted-foreground">
        Loading…
      </p>
    )
  }
  return (
    <LogFlow
      key={draft.key}
      tracker={tracker}
      plan={plan ?? null}
      existing={existing}
      existingRetries={existingRetries}
      draft={draft}
      today={today}
    />
  )
}

function freshDraft(
  key: string,
  userId: string,
  assignmentId: string,
  tracker: Tracker,
  plan: PlanItem | undefined,
  date: string,
  existing: EntryView | undefined,
  retries: FollowupView[],
): Draft {
  const now = new Date().toISOString()
  const fields = tracker.fields
  const start = initialData(fields, plan?.details ?? null)
  // Editing: keep what was logged, for the fields this version of the tracker still has.
  const kept = existing
    ? Object.fromEntries(
        Object.entries(existing.data).filter(([k]) => fields.some((f) => f.key === k)),
      )
    : {}
  return {
    key,
    userId,
    assignmentId,
    planItemId: plan?.id ?? null,
    date: existing?.date ?? date,
    entryId: existing?.id ?? crypto.randomUUID(),
    editing: existing !== undefined,
    fieldVersion: tracker.field_version,
    data: { ...start, ...kept },
    followups: retries.map(({ id, label, due_date }) => ({ id, label, due_date })),
    step: 0,
    startedAt: now,
    updatedAt: now,
  }
}

function Problem({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Page title={title}>
      <EmptyNote>{children}</EmptyNote>
      <Link to="/today" className="text-foreground underline underline-offset-4">
        Back to Today
      </Link>
    </Page>
  )
}
