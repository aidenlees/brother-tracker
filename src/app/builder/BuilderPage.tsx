import { ArrowLeft } from 'lucide-react'
import { useId, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { EmptyNote, Page } from '@/components/Page'
import { leaf, note, sheet } from '@/components/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAdminTrackers, useTrackerWrites, type AdminTracker } from '@/lib/tracker-admin'
import { blankDraft, draftFrom, type Draft } from '@/trackers/builder'
import { TrackerIcon } from '@/trackers/TrackerIcon'
import { TrackerEditor } from './TrackerEditor'

const TITLE = 'Trackers'

/**
 * Tracker builder (admin; CLAUDE.md, "Tracker builder"): every tracker, a new one from a
 * blank or a copy, and the editor (questions, a live preview of the student's log,
 * weekly numbers, publish). A tracker is data: nothing here needs code or a migration.
 */
export function BuilderPage() {
  const trackers = useAdminTrackers()
  const [search, setSearch] = useSearchParams()
  const [draft, setDraft] = useState<Draft | null>(null)
  /** What the last save did; kept here, since the editor starts afresh on a new version. */
  const [saved, setSaved] = useState<ReactNode>(null)
  const editing = search.get('tracker')

  if (trackers.status === 'pending') {
    return (
      <Page title={TITLE}>
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      </Page>
    )
  }
  if (trackers.status === 'error') {
    return (
      <Page title={TITLE}>
        <EmptyNote>Couldn’t load the trackers. Check your connection, then reload.</EmptyNote>
      </Page>
    )
  }

  const list = trackers.data
  const close = () => {
    setDraft(null)
    setSaved(null)
    setSearch({}, { replace: false })
  }
  const notice = (
    <div role="status" className="empty:hidden">
      {saved ? <p className={note()}>{saved}</p> : null}
    </div>
  )
  const back = (
    <button
      type="button"
      onClick={close}
      className="flex items-center gap-1.5 text-small text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft aria-hidden className="size-4" />
      All trackers
    </button>
  )

  if (editing) {
    const tracker = list.find((t) => t.id === editing)
    if (!tracker) {
      return (
        <Page title={TITLE} back={back}>
          <EmptyNote>That tracker isn’t here any more.</EmptyNote>
        </Page>
      )
    }
    return (
      <Page title={`Edit ${tracker.name}`} back={back}>
        {notice}
        <TrackerEditor
          key={`${tracker.id}:${String(tracker.fieldVersion)}`}
          initial={draftFrom(tracker)}
          tracker={tracker}
          onSaved={(_id, version) => {
            setSaved(`Saved. The questions are at version ${String(version)}.`)
          }}
        />
      </Page>
    )
  }
  if (draft) {
    return (
      <Page title="New tracker" back={back}>
        <TrackerEditor
          initial={draft}
          tracker={null}
          onSaved={(id) => {
            setDraft(null)
            setSaved(
              <>
                Published.{' '}
                <Link to="/people" className="underline underline-offset-4">
                  Give it to a student on People
                </Link>
                .
              </>,
            )
            setSearch({ tracker: id })
          }}
        />
      </Page>
    )
  }

  return (
    <Page
      title={TITLE}
      lead="What students log. Each tracker is data: change it here, with no code."
    >
      <NewTracker list={list} onStart={setDraft} />
      <TrackerList list={list} />
    </Page>
  )
}

function NewTracker({ list, onStart }: { list: AdminTracker[]; onStart: (d: Draft) => void }) {
  const headingId = useId()
  const nameId = useId()
  const fromId = useId()
  const [name, setName] = useState('')
  const [from, setFrom] = useState('blank')
  const [missing, setMissing] = useState(false)
  const sort = Math.max(0, ...list.map((t) => t.sort)) + 1
  const copyable = list.filter((t) => !t.archived && t.display !== 'task_list')

  return (
    <section aria-labelledby={headingId} className={sheet(false, 'gap-5')}>
      <h2 id={headingId} className="font-heading text-title text-foreground">
        New tracker
      </h2>
      <form
        aria-labelledby={headingId}
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) {
            setMissing(true)
            return
          }
          const source = copyable.find((t) => t.id === from)
          onStart(
            source ? draftFrom(source, { name: name.trim(), sort }) : blankDraft(name.trim(), sort),
          )
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              value={name}
              maxLength={60}
              aria-invalid={missing}
              onChange={(e) => {
                setName(e.target.value)
                setMissing(false)
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={fromId}>Start from</Label>
            <select
              id={fromId}
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
              }}
              className="h-11 w-full min-w-0 rounded-md border border-input bg-card px-3 text-body text-foreground"
            >
              <option value="blank">Blank (two starter questions)</option>
              {copyable.map((t) => (
                <option key={t.id} value={t.id}>
                  A copy of {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {missing ? <p className="text-small text-destructive">Give it a name first.</p> : null}
        <div>
          <Button type="submit">Start</Button>
        </div>
      </form>
    </section>
  )
}

function TrackerList({ list }: { list: AdminTracker[] }) {
  const headingId = useId()
  const { archive } = useTrackerWrites()
  return (
    <section aria-labelledby={headingId} className={sheet()}>
      <h2 id={headingId} className="font-heading text-title text-foreground">
        All trackers
      </h2>
      <ul className="flex flex-col gap-6">
        {list.map((t) => (
          <li key={t.id}>
            <article
              aria-label={t.name}
              style={{ '--tracker': `var(--tracker-${t.color})` } as CSSProperties}
              className={leaf('gap-2')}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <h3 className="flex items-center gap-2 text-lead text-foreground">
                  <TrackerIcon name={t.icon} className="size-5 shrink-0 text-tracker" />
                  {t.name}
                  {t.archived ? (
                    <span className="text-small text-muted-foreground">Archived</span>
                  ) : null}
                </h3>
                <div className="flex items-center gap-4">
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/builder?tracker=${t.id}`}>
                      Edit<span className="sr-only"> {t.name}</span>
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto px-0"
                    disabled={archive.isPending}
                    onClick={() => {
                      archive.mutate({ id: t.id, archived: !t.archived })
                    }}
                  >
                    {t.archived ? 'Restore' : 'Archive'}
                    <span className="sr-only"> {t.name}</span>
                  </Button>
                </div>
              </div>
              <p className="text-small text-muted-foreground">
                {[
                  t.display === 'task_list'
                    ? 'Tasks the admin adds'
                    : t.cadence.type === 'daily'
                      ? 'Every day'
                      : 'Follows a plan',
                  `${String(t.fields.length)} ${t.fields.length === 1 ? 'question' : 'questions'}`,
                  `version ${String(t.fieldVersion)}`,
                  t.students === 0
                    ? 'no students yet'
                    : `${String(t.students)} ${t.students === 1 ? 'student' : 'students'}`,
                ].join(' · ')}
              </p>
            </article>
          </li>
        ))}
      </ul>
      {archive.error ? (
        <p role="alert" className={note('text-small text-destructive')}>
          {archive.error.message}
        </p>
      ) : null}
    </section>
  )
}
