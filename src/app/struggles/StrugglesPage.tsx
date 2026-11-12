import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { Thread } from '@/components/Comments'
import { EmptyNote, Page } from '@/components/Page'
import { StudentPicker } from '@/components/StudentPicker'
import { leaf } from '@/components/sheet'
import { Button } from '@/components/ui/button'
import { useStudents, type Student } from '@/lib/admin-logs'
import { formatDay } from '@/lib/dates'
import { hasOpenRetry, useStruggles, type Struggle } from '@/lib/struggles'
import { useToday } from '@/lib/use-today'
import { retryStatus } from '@/trackers/followups'
import { sessionLabel, workLabel } from '@/trackers/plan'
import { TrackerIcon } from '@/trackers/TrackerIcon'

/**
 * Struggles (admin, viewers): what a student marked as a struggle, newest first, each
 * problem with where its retry stands, and the conversation about it. "Retry still open"
 * narrows it to the work not yet redone. Overview's log cards link straight to one.
 */
export function StrugglesPage() {
  const students = useStudents()
  const [search, setSearch] = useSearchParams()
  const [chosen, setChosen] = useState<string | null>(search.get('student'))
  const openOnly = search.get('show') === 'open'
  const today = useToday()

  if (students.status === 'pending') {
    return (
      <Page title="Struggles">
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      </Page>
    )
  }
  if (students.status === 'error') {
    return (
      <Page title="Struggles">
        <EmptyNote>Couldn’t load the students. Check your connection, then reload.</EmptyNote>
      </Page>
    )
  }
  const list = students.data
  const student = list.find((s) => s.id === chosen) ?? list[0]
  if (!student) {
    return (
      <Page title="Struggles">
        <EmptyNote>
          No student has a tracker yet. What they struggle with will show up here.
        </EmptyNote>
      </Page>
    )
  }

  const show = (open: boolean) => {
    setSearch(
      (params) => {
        if (open) params.set('show', 'open')
        else params.delete('show')
        return params
      },
      { replace: true },
    )
  }

  return (
    <Page
      title="Struggles"
      lead="Every problem marked as a struggle, newest first, with where its retry stands."
    >
      <div className="flex flex-col gap-4">
        <StudentPicker students={list} value={student} onChange={setChosen} />
        <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={openOnly ? 'outline' : 'default'}
            aria-pressed={!openOnly}
            onClick={() => {
              show(false)
            }}
          >
            All
          </Button>
          <Button
            type="button"
            size="sm"
            variant={openOnly ? 'default' : 'outline'}
            aria-pressed={openOnly}
            onClick={() => {
              show(true)
            }}
          >
            Retry still open
          </Button>
        </div>
      </div>
      <List key={student.id} student={student} openOnly={openOnly} today={today} />
    </Page>
  )
}

function List({
  student,
  openOnly,
  today,
}: {
  student: Student
  openOnly: boolean
  today: string
}) {
  const struggles = useStruggles(student.id)
  const { hash } = useLocation()
  const scrolled = useRef(false)

  // Arriving from an Overview log card: bring that log into view, once.
  useEffect(() => {
    if (!struggles.data || !hash || scrolled.current) return
    scrolled.current = true
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' })
  }, [struggles.data, hash])

  if (struggles.status === 'pending') {
    return (
      <p role="status" className="text-muted-foreground">
        Loading {student.name}’s struggles…
      </p>
    )
  }
  if (struggles.status === 'error') {
    return (
      <EmptyNote>
        Couldn’t load {student.name}’s struggles. Check your connection, then reload.
      </EmptyNote>
    )
  }
  const shown = openOnly ? struggles.data.filter(hasOpenRetry) : struggles.data
  if (shown.length === 0) {
    return (
      <EmptyNote>
        {openOnly
          ? `Every retry of ${student.name}’s is done or dropped.`
          : `${student.name} hasn’t marked anything as a struggle yet.`}
      </EmptyNote>
    )
  }
  return (
    <ul className="flex flex-col gap-8">
      {shown.map((struggle) => (
        <li key={struggle.id}>
          <StruggleCard struggle={struggle} today={today} />
        </li>
      ))}
    </ul>
  )
}

/** One log: the session, what was struggled with and each retry, then the comments. */
function StruggleCard({ struggle, today }: { struggle: Struggle; today: string }) {
  const headingId = useId()
  const { tracker, plan } = struggle
  const title = plan ? (sessionLabel(plan.details) ?? plan.title) : struggle.trackerName
  const details = [plan ? workLabel(plan) : null, formatDay(struggle.date, 'long')]
    .filter(Boolean)
    .join(' · ')
  const retryFor = new Map(struggle.retries.map((r) => [r.label, r]))

  return (
    <article
      id={`entry-${struggle.id}`}
      aria-labelledby={headingId}
      style={
        tracker ? ({ '--tracker': `var(--tracker-${tracker.color})` } as CSSProperties) : undefined
      }
      className={leaf('scroll-mt-6 gap-6')}
    >
      <header className="flex flex-col gap-1">
        <h2
          id={headingId}
          className="flex items-center gap-2 text-body font-medium text-foreground"
        >
          {tracker ? (
            <TrackerIcon name={tracker.icon} className="size-4 shrink-0 text-tracker" />
          ) : null}
          {title}
        </h2>
        <p className="text-small text-muted-foreground tabular-nums">{details}</p>
      </header>
      <div className="flex flex-col gap-2">
        <h3 className="text-small text-muted-foreground">Struggled with</h3>
        {struggle.problems.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {struggle.problems.map((problem) => {
              const retry = retryFor.get(problem)
              return (
                <li
                  key={problem}
                  className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
                >
                  <span className="text-foreground tabular-nums">{problem}</span>
                  {retry ? (
                    <span className="text-small text-muted-foreground">
                      {retryStatus(retry, today)}
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="whitespace-pre-line text-foreground">{struggle.text}</p>
        )}
      </div>
      <div className="border-t border-border pt-6">
        <Thread entryId={struggle.id} comments={struggle.comments} heading="h3" />
      </div>
    </article>
  )
}
