import { useId, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { EmptyNote, Page } from '@/components/Page'
import { StudentPicker } from '@/components/StudentPicker'
import { useStudents, type Student } from '@/lib/admin-logs'
import { formatDay } from '@/lib/dates'
import { useRetryQueue, type QueuedRetry, type TrackerQueue } from '@/lib/retry-queue'
import { useToday } from '@/lib/use-today'
import { dueLabel } from '@/trackers/followups'
import { sessionLabel } from '@/trackers/plan'
import { TrackerIcon } from '@/trackers/TrackerIcon'

const TITLE = 'Retry queue'

/**
 * Retry queue (admin): one student's open retries, overdue first. Read only, since only
 * the student marks a retry done; each one links to its log on Struggles, where the
 * admin can say something about it.
 */
export function RetriesPage() {
  const students = useStudents()
  const [search] = useSearchParams()
  const [chosen, setChosen] = useState<string | null>(search.get('student'))
  const today = useToday()

  if (students.status === 'pending') {
    return (
      <Page title={TITLE}>
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      </Page>
    )
  }
  if (students.status === 'error') {
    return (
      <Page title={TITLE}>
        <EmptyNote>Couldn’t load the students. Check your connection, then reload.</EmptyNote>
      </Page>
    )
  }
  const list = students.data
  const student = list.find((s) => s.id === chosen) ?? list[0]
  if (!student) {
    return (
      <Page title={TITLE}>
        <EmptyNote>No student has a tracker yet. Their retries will show up here.</EmptyNote>
      </Page>
    )
  }
  return (
    <Page title={TITLE} lead="Every retry still open, overdue first.">
      <StudentPicker students={list} value={student} onChange={setChosen} />
      <Queue key={student.id} student={student} today={today} />
    </Page>
  )
}

function Queue({ student, today }: { student: Student; today: string }) {
  const queue = useRetryQueue(student.id, today)
  if (queue.status === 'pending') {
    return (
      <p role="status" className="text-muted-foreground">
        Loading {student.name}’s retries…
      </p>
    )
  }
  if (queue.status === 'error') {
    return (
      <EmptyNote>
        Couldn’t load {student.name}’s retries. Check your connection, then reload.
      </EmptyNote>
    )
  }
  if (queue.data.length === 0) {
    return <EmptyNote>No retries open for {student.name}.</EmptyNote>
  }
  return (
    <ul className="flex flex-col gap-4">
      {queue.data.map((card) => (
        <li key={card.assignmentId}>
          <TrackerCard card={card} studentId={student.id} today={today} />
        </li>
      ))}
    </ul>
  )
}

function TrackerCard({
  card,
  studentId,
  today,
}: {
  card: TrackerQueue
  studentId: string
  today: string
}) {
  const headingId = useId()
  const { tracker, review } = card
  const groups = [
    { name: 'Overdue', retries: card.overdue, showDue: true },
    { name: 'Due today', retries: card.dueToday, showDue: false },
    { name: 'Coming up', retries: card.comingUp, showDue: true },
  ].filter((g) => g.retries.length > 0)

  return (
    <section
      aria-labelledby={headingId}
      style={
        tracker ? ({ '--tracker': `var(--tracker-${tracker.color})` } as CSSProperties) : undefined
      }
      className="flex flex-col gap-6 rounded-lg border border-border bg-card p-5 sm:p-6"
    >
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          {tracker ? (
            <TrackerIcon name={tracker.icon} className="size-5 shrink-0 text-tracker" />
          ) : null}
          <h2 id={headingId} className="font-heading text-title text-foreground">
            {card.trackerName}
          </h2>
        </div>
        {review ? (
          <p className="text-small text-muted-foreground">
            Every open retry comes up again{' '}
            {review.date === today ? 'today' : `on ${formatDay(review.date)}`}, in{' '}
            {sessionLabel(review.details) ?? review.title}.
          </p>
        ) : null}
      </header>
      {groups.map((group) => (
        <Group key={group.name} name={group.name}>
          {group.retries.map((retry) => (
            <Row
              key={retry.id}
              retry={retry}
              due={group.showDue ? dueLabel(retry.due_date, today) : null}
              studentId={studentId}
            />
          ))}
        </Group>
      ))}
    </section>
  )
}

function Group({ name, children }: { name: string; children: ReactNode }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="text-body font-medium text-foreground">
        {name}
      </h3>
      <ul className="flex flex-col gap-3">{children}</ul>
    </section>
  )
}

/** One retry: the problem, when it's due, and the log it came from. */
function Row({
  retry,
  due,
  studentId,
}: {
  retry: QueuedRetry
  due: string | null
  studentId: string
}) {
  const from = [
    retry.plan ? (sessionLabel(retry.plan.details) ?? retry.plan.title) : null,
    formatDay(retry.entryDate),
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <li className="flex flex-col gap-0.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <span className="text-foreground tabular-nums">{retry.label}</span>
        {due ? <span className="text-small text-muted-foreground">{due}</span> : null}
      </div>
      <Link
        to={`/struggles?student=${studentId}#entry-${retry.entryId}`}
        className="self-start text-small text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        {from}
        <span className="sr-only"> on Struggles</span>
      </Link>
    </li>
  )
}
