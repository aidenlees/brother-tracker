import { useId, useState, type CSSProperties } from 'react'
import { ClearLog } from '@/components/ClearLog'
import { EmptyNote, Page } from '@/components/Page'
import { useAuth } from '@/lib/auth-context'
import {
  RECENT_DAYS,
  useClearLog,
  useRecentLogs,
  useStudents,
  type LoggedEntry,
  type Student,
} from '@/lib/admin-logs'
import { formatDay } from '@/lib/dates'
import { useToday } from '@/lib/use-today'
import { shownFields } from '@/trackers/entry'
import { FIELD_REGISTRY } from '@/trackers/fields/registry'
import { sessionLabel, workLabel } from '@/trackers/plan'
import { TrackerIcon } from '@/trackers/TrackerIcon'

/**
 * Overview (admin, viewers): what a student has logged in the last two weeks, newest
 * first, with each answer. The admin can clear a log made by mistake; viewers only read.
 * Weekly numbers and trends come next (Phase 3).
 */
export function OverviewPage() {
  const students = useStudents()
  const [chosen, setChosen] = useState<string | null>(null)
  const pickerId = useId()

  if (students.status === 'pending') {
    return (
      <Page title="Overview">
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      </Page>
    )
  }
  if (students.status === 'error') {
    return (
      <Page title="Overview">
        <EmptyNote>Couldn’t load the students. Check your connection, then reload.</EmptyNote>
      </Page>
    )
  }
  const list = students.data
  const student = list.find((s) => s.id === chosen) ?? list[0]
  if (!student) {
    return (
      <Page title="Overview">
        <EmptyNote>No student has a tracker yet. Each student’s logs will show up here.</EmptyNote>
      </Page>
    )
  }
  return (
    <Page
      title="Overview"
      lead={`What’s been logged in the last ${RECENT_DAYS} days, newest first.`}
    >
      {list.length > 1 ? (
        <label htmlFor={pickerId} className="flex flex-col gap-2 text-small text-muted-foreground">
          Student
          <select
            id={pickerId}
            value={student.id}
            onChange={(e) => {
              setChosen(e.target.value)
            }}
            className="h-11 max-w-sm rounded-md border border-input bg-card px-3 text-body text-foreground"
          >
            {list.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-body text-foreground">{student.name}</p>
      )}
      <Logs key={student.id} student={student} />
    </Page>
  )
}

function Logs({ student }: { student: Student }) {
  const today = useToday()
  const auth = useAuth()
  const isAdmin = auth.status === 'signed-in' && auth.profile.role === 'admin'
  const logs = useRecentLogs(student.id, today)
  const clear = useClearLog()
  const [notice, setNotice] = useState<string | null>(null)

  if (logs.status === 'pending') {
    return (
      <p role="status" className="text-muted-foreground">
        Loading {student.name}’s logs…
      </p>
    )
  }
  if (logs.status === 'error') {
    return (
      <EmptyNote>
        Couldn’t load {student.name}’s logs. Check your connection, then reload.
      </EmptyNote>
    )
  }

  const days = [...new Set(logs.data.map((log) => log.date))]
  return (
    <div className="flex flex-col gap-8">
      <p role="status" className="text-small text-muted-foreground empty:hidden">
        {notice}
      </p>
      {clear.error ? (
        <p role="alert" className="text-destructive">
          {clear.error.message}
        </p>
      ) : null}
      {days.length === 0 ? (
        <EmptyNote>Nothing logged in the last {RECENT_DAYS} days.</EmptyNote>
      ) : (
        days.map((day) => (
          <section key={day} aria-label={formatDay(day, 'long')} className="flex flex-col gap-3">
            <h2 className="text-body font-medium text-foreground">
              {day === today ? `Today · ${formatDay(day, 'long')}` : formatDay(day, 'long')}
            </h2>
            <ul className="flex flex-col gap-4">
              {logs.data
                .filter((log) => log.date === day)
                .map((log) => (
                  <li key={log.id}>
                    <LogCard
                      log={log}
                      onClear={
                        isAdmin
                          ? async () => {
                              setNotice(null)
                              await clear.mutateAsync(log.id).then(
                                () => {
                                  setNotice(
                                    `Cleared ${student.name}’s ${log.trackerName} log for ${formatDay(log.date, 'long')}.`,
                                  )
                                },
                                () => undefined,
                              )
                            }
                          : null
                      }
                    />
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}

/** One log: the tracker, the session it was for, each answer, and (admin) Clear. */
function LogCard({ log, onClear }: { log: LoggedEntry; onClear: (() => Promise<void>) | null }) {
  const headingId = useId()
  const { tracker, plan } = log
  const details = plan?.details ?? null
  const fields = tracker
    ? shownFields(tracker.fields, log.data, details).filter((f) => log.data[f.key] !== undefined)
    : []
  const session = plan
    ? [sessionLabel(plan.details), workLabel(plan)].filter(Boolean).join(' · ')
    : null
  return (
    <article
      aria-labelledby={headingId}
      style={
        tracker ? ({ '--tracker': `var(--tracker-${tracker.color})` } as CSSProperties) : undefined
      }
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 sm:p-6"
    >
      <header className="flex flex-col gap-1">
        <h3
          id={headingId}
          className="flex items-center gap-2 text-body font-medium text-foreground"
        >
          {tracker ? (
            <TrackerIcon name={tracker.icon} className="size-4 shrink-0 text-tracker" />
          ) : null}
          {log.trackerName}
        </h3>
        {session ? (
          <p className="text-small text-muted-foreground tabular-nums">{session}</p>
        ) : null}
        {plan && plan.date !== log.date ? (
          <p className="text-small text-muted-foreground">
            Planned for {formatDay(plan.date, 'long')}; done{' '}
            {plan.date > log.date ? 'early' : 'late'}.
          </p>
        ) : null}
      </header>
      {tracker ? (
        <dl className="flex flex-col gap-3">
          {fields.map((field) => (
            <div key={field.key} className="flex flex-col gap-0.5">
              <dt className="text-small text-muted-foreground">{field.label}</dt>
              <dd className="whitespace-pre-line text-foreground">
                {FIELD_REGISTRY[field.type].summary(log.data[field.key], field)}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-muted-foreground">
          This version of the app can’t show this tracker’s answers.
        </p>
      )}
      {onClear ? (
        <ClearLog
          retries={log.retries}
          comments={log.comments}
          note="The student sees it gone; the audit log keeps a copy."
          onClear={onClear}
        />
      ) : null}
    </article>
  )
}
