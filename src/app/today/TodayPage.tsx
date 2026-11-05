import { ArrowRight } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { EmptyNote, Page } from '@/components/Page'
import { Button } from '@/components/ui/button'
import { formatDay } from '@/lib/dates'
import { useOutbox } from '@/lib/outbox/outbox-context'
import { isEditable, type EntryView } from '@/lib/outbox/overlay'
import type { Draft } from '@/lib/outbox/types'
import { useDrafts } from '@/lib/outbox/use-drafts'
import { useStudentData, type Assignment, type StudentData } from '@/lib/student-data'
import { useToday } from '@/lib/use-today'
import { streak } from '@/trackers/metrics/streak'
import { logPath } from '../log/paths'
import { InlineCheckIn } from './InlineCheckIn'
import { PlanCard } from './PlanCard'
import { SavedNote, TrackerCard } from './TrackerCard'

/** Today answers one question: what do I log today? One card per active assignment. */
export function TodayPage() {
  const today = useToday()
  const data = useStudentData()
  const drafts = useDrafts(useOutbox().userId)
  /** Set by the log flow after a save, so that entry's check mark eases in. */
  const savedId = (useLocation().state as { saved?: string } | null)?.saved

  return (
    <Page title="Today" lead={formatDay(today, 'long')}>
      {data.status === 'loading' ? (
        <p role="status" className="text-muted-foreground">
          Loading your trackers…
        </p>
      ) : data.status === 'error' ? (
        <EmptyNote>Couldn’t load your trackers. Check your connection, then reload.</EmptyNote>
      ) : data.assignments.length === 0 ? (
        <EmptyNote>Your trackers will show up here once your admin assigns them.</EmptyNote>
      ) : (
        <div className="flex max-w-2xl flex-col gap-6">
          {data.assignments.map((assignment) => (
            <AssignmentCard
              key={assignment.id}
              assignment={assignment}
              data={data}
              drafts={drafts.filter((d) => d.assignmentId === assignment.id)}
              savedId={savedId}
              today={today}
            />
          ))}
        </div>
      )}
    </Page>
  )
}

function AssignmentCard({
  assignment,
  data,
  drafts,
  savedId,
  today,
}: {
  assignment: Assignment
  data: StudentData
  drafts: Draft[]
  savedId?: string
  today: string
}) {
  const tracker = assignment.tracker
  if (!tracker) {
    return (
      <TrackerCard name={assignment.trackerName} icon="circle" color="ink-blue">
        <p className="text-muted-foreground">
          This tracker can’t be shown in this version of the app. Ask your admin.
        </p>
      </TrackerCard>
    )
  }

  const entries = data.entries.filter((e) => e.assignment_id === assignment.id)
  const metric = tracker.metrics.find((m) => m.type === 'streak')
  const run = metric ? streak(entries, metric.where, today) : null

  return (
    <TrackerCard
      name={tracker.name}
      icon={tracker.icon}
      color={tracker.color}
      aside={metric && run ? `${metric.label} · ${run === 1 ? '1 day' : `${run} days`}` : null}
    >
      {tracker.cadence.type === 'plan' ? (
        <PlanCard
          assignment={assignment}
          items={data.planItems.filter((item) => item.assignment_id === assignment.id)}
          entries={entries}
          drafts={drafts}
          savedId={savedId}
          today={today}
        />
      ) : tracker.display === 'inline_on_today_card' ? (
        <InlineCheckIn
          key={today}
          assignment={assignment}
          tracker={tracker}
          entries={entries}
          today={today}
        />
      ) : (
        <DailyLog
          assignment={assignment}
          entries={entries}
          inProgress={drafts.some((d) => d.planItemId === null && d.date === today)}
          savedId={savedId}
          today={today}
        />
      )}
    </TrackerCard>
  )
}

/** A daily tracker logged in the step-by-step flow rather than on its card. */
function DailyLog({
  assignment,
  entries,
  inProgress,
  savedId,
  today,
}: {
  assignment: Assignment
  entries: EntryView[]
  inProgress: boolean
  savedId?: string
  today: string
}) {
  if (today < assignment.start_date) {
    return (
      <p className="text-muted-foreground">Starts {formatDay(assignment.start_date, 'long')}.</p>
    )
  }
  const entry = entries.find((e) => e.date === today && e.plan_item_id === null)
  const href = logPath(assignment.id, { date: today })
  return entry ? (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <SavedNote sync={entry.sync} reason={entry.reason} fresh={entry.id === savedId} />
      {isEditable(entry) ? (
        <Button asChild variant="link" size="sm" className="h-auto px-0">
          <Link to={href}>{inProgress ? 'Resume editing' : 'Edit'}</Link>
        </Button>
      ) : null}
    </div>
  ) : (
    <Button asChild size="lg" className="self-start">
      <Link to={href}>
        {inProgress ? 'Resume logging' : 'Log today'}
        <ArrowRight aria-hidden />
      </Link>
    </Button>
  )
}
