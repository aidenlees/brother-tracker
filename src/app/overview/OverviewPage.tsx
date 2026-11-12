import { useId, useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ClearLog } from '@/components/ClearLog'
import { EmptyNote, Page } from '@/components/Page'
import { StudentPicker } from '@/components/StudentPicker'
import { leaf, sheet } from '@/components/sheet'
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
import { weekStart } from '@/trackers/schedule'
import { TrackerIcon } from '@/trackers/TrackerIcon'
import { WeekNumbers } from './WeekNumbers'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Overview (admin, viewers): how a student's week went, tracker by tracker, then what
 * they logged in the last two weeks, newest first, with each answer. The admin also sees
 * pacing flags and can clear a log made by mistake; viewers only read.
 */
export function OverviewPage() {
  const students = useStudents()
  const [chosen, setChosen] = useState<string | null>(null)
  const recentId = useId()
  const today = useToday()
  const auth = useAuth()
  const isAdmin = auth.status === 'signed-in' && auth.profile.role === 'admin'
  const [search] = useSearchParams()
  const asked = search.get('week')
  const thisWeek = weekStart(today)
  const picked = weekStart(asked && ISO_DATE.test(asked) ? asked : today)
  // Overview looks back: a week still to come shows this one.
  const sunday = picked > thisWeek ? thisWeek : picked
  const weekLink = (start: string) => (start === thisWeek ? '/overview' : `/overview?week=${start}`)

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
    <Page title="Overview" lead="How each week went, and every log from the last two weeks.">
      <StudentPicker students={list} value={student} onChange={setChosen} />
      <WeekNumbers
        key={student.id}
        student={student}
        sunday={sunday}
        thisWeek={thisWeek}
        today={today}
        isAdmin={isAdmin}
        weekLink={weekLink}
      />
      <section aria-labelledby={recentId} className={sheet()}>
        <div className="flex flex-col gap-1">
          <h2 id={recentId} className="font-heading text-title text-foreground">
            Recent logs
          </h2>
          <p className="text-small text-muted-foreground">
            The last {RECENT_DAYS} days, newest first.
          </p>
        </div>
        <Logs key={student.id} student={student} today={today} isAdmin={isAdmin} />
      </section>
    </Page>
  )
}

function Logs({ student, today, isAdmin }: { student: Student; today: string; isAdmin: boolean }) {
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
            <h3 className="text-body font-medium text-foreground">
              {day === today ? `Today · ${formatDay(day, 'long')}` : formatDay(day, 'long')}
            </h3>
            <ul className="flex flex-col gap-6">
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
      className={leaf()}
    >
      <header className="flex flex-col gap-1">
        <h4
          id={headingId}
          className="flex items-center gap-2 text-body font-medium text-foreground"
        >
          {tracker ? (
            <TrackerIcon name={tracker.icon} className="size-4 shrink-0 text-tracker" />
          ) : null}
          {log.trackerName}
        </h4>
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
      {log.struggled ? (
        <Link
          to={`/struggles?student=${log.studentId}#entry-${log.id}`}
          className="self-start text-small text-foreground underline underline-offset-4 hover:text-muted-foreground"
        >
          {log.comments === 0
            ? 'Add a comment'
            : `${String(log.comments)} ${log.comments === 1 ? 'comment' : 'comments'}`}
          <span className="sr-only"> on Struggles</span>
        </Link>
      ) : null}
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
