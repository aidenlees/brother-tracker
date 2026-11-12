import { RefreshCw } from 'lucide-react'
import { useId, useState, type CSSProperties, type ReactNode, type SyntheticEvent } from 'react'
import { EmptyNote, Page } from '@/components/Page'
import { leaf, note, sheet } from '@/components/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth-context'
import { formatDay, formatMoment } from '@/lib/dates'
import {
  temporaryPassword,
  usePeople,
  usePeopleWrites,
  type People,
  type Person,
} from '@/lib/people'
import type { Role } from '@/lib/supabase'
import { useToday } from '@/lib/use-today'
import { Segmented } from '@/trackers/fields/controls'
import { TrackerIcon } from '@/trackers/TrackerIcon'

const TITLE = 'People'

const ROLE_OPTIONS: { key: Role; label: string }[] = [
  { key: 'student', label: 'Student' },
  { key: 'viewer', label: 'Viewer' },
  { key: 'admin', label: 'Admin' },
]

const GROUPS: { role: Role; title: string; hint: string }[] = [
  { role: 'student', title: 'Students', hint: 'Log their own practice.' },
  { role: 'viewer', title: 'Viewers', hint: 'Follow the students linked to them, and comment.' },
  { role: 'admin', title: 'Admins', hint: 'Run everything here.' },
]

/**
 * People (admin): who can sign in, what each viewer sees, and what each student works on
 * (CLAUDE.md, "Adding people"). Accounts go through admin-users; the rest is RLS.
 */
export function PeoplePage() {
  const people = usePeople()
  const auth = useAuth()
  const me = auth.status === 'signed-in' ? auth.profile.id : null

  if (people.status === 'pending') {
    return (
      <Page title={TITLE}>
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      </Page>
    )
  }
  if (people.status === 'error') {
    return (
      <Page title={TITLE}>
        <EmptyNote>
          {people.error.message || 'Couldn’t load the people. Reload and try again.'}
        </EmptyNote>
      </Page>
    )
  }
  return (
    <Page title={TITLE} lead="Who signs in, what each viewer sees, and what each student works on.">
      <AddPerson />
      {GROUPS.map((group) => (
        <Group key={group.role} {...group} data={people.data} me={me} />
      ))}
    </Page>
  )
}

function Group({
  role,
  title,
  hint,
  data,
  me,
}: {
  role: Role
  title: string
  hint: string
  data: People
  me: string | null
}) {
  const headingId = useId()
  const list = data.people.filter((p) => p.role === role)
  return (
    <section aria-labelledby={headingId} className={sheet()}>
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="font-heading text-title text-foreground">
          {title}
        </h2>
        <p className="text-small text-muted-foreground">{hint}</p>
      </div>
      {list.length === 0 ? (
        <p className="text-muted-foreground">No one yet.</p>
      ) : (
        <ul className="flex flex-col gap-6">
          {list.map((person) => (
            <li key={person.id}>
              <PersonEntry person={person} data={data} isMe={person.id === me} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

type Editing = 'rename' | 'password' | 'active' | 'role' | null

function PersonEntry({ person, data, isMe }: { person: Person; data: People; isMe: boolean }) {
  const headingId = useId()
  const [editing, setEditing] = useState<Editing>(null)
  const [done, setDone] = useState<ReactNode>(null)
  const seen = person.lastSignInAt
    ? `last signed in ${formatMoment(person.lastSignInAt)}`
    : 'never signed in'

  const open = (next: Editing) => {
    setDone(null)
    setEditing((was) => (was === next ? null : next))
  }
  const finish = (message: ReactNode) => {
    setEditing(null)
    setDone(message)
  }

  return (
    <article aria-labelledby={headingId} className={leaf()}>
      <header className="flex flex-col gap-1">
        <h3
          id={headingId}
          className="flex flex-wrap items-baseline gap-x-3 text-lead text-foreground"
        >
          {person.name}
          {isMe ? <span className="text-small text-muted-foreground">You</span> : null}
          {!person.active ? (
            <span className="text-small text-destructive">Disabled: can’t sign in</span>
          ) : null}
        </h3>
        <p className="text-small text-muted-foreground">
          {person.email ? (
            <>
              <span className="break-all">{person.email}</span> ·{' '}
            </>
          ) : null}
          {seen}
        </p>
      </header>

      {person.role === 'student' ? <StudentTrackers student={person} data={data} /> : null}
      {person.role === 'viewer' ? <ViewerLinks viewer={person} data={data} /> : null}
      {person.role === 'student' ? <SeenBy student={person} data={data} /> : null}

      <div
        role="group"
        aria-label={`${person.name}’s account`}
        className="flex flex-wrap gap-x-5 gap-y-1"
      >
        <Action
          label="Rename"
          pressed={editing === 'rename'}
          onClick={() => {
            open('rename')
          }}
        />
        <Action
          label="New password"
          pressed={editing === 'password'}
          onClick={() => {
            open('password')
          }}
        />
        {!isMe ? (
          <>
            <Action
              label={person.active ? 'Disable' : 'Enable'}
              pressed={editing === 'active'}
              onClick={() => {
                open('active')
              }}
            />
            <Action
              label="Change role"
              pressed={editing === 'role'}
              onClick={() => {
                open('role')
              }}
            />
          </>
        ) : null}
      </div>

      {editing === 'rename' ? (
        <Rename
          person={person}
          onDone={() => {
            finish(`Renamed to ${person.name}.`)
          }}
          onCancel={() => {
            open(null)
          }}
        />
      ) : null}
      {editing === 'password' ? (
        <NewPassword
          person={person}
          onDone={finish}
          onCancel={() => {
            open(null)
          }}
        />
      ) : null}
      {editing === 'active' ? (
        <SetActive
          person={person}
          onDone={finish}
          onCancel={() => {
            open(null)
          }}
        />
      ) : null}
      {editing === 'role' ? (
        <ChangeRole
          person={person}
          onDone={finish}
          onCancel={() => {
            open(null)
          }}
        />
      ) : null}
      <div role="status" className="empty:hidden">
        {done ? <p className={note('text-small')}>{done}</p> : null}
      </div>
    </article>
  )
}

function Action({
  label,
  pressed,
  onClick,
}: {
  label: string
  pressed: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="h-auto px-0"
      aria-expanded={pressed}
      onClick={onClick}
    >
      {label}
    </Button>
  )
}

function StudentTrackers({ student, data }: { student: Person; data: People }) {
  const { assign, pause } = usePeopleWrites()
  const today = useToday()
  const mine = data.assignments.filter((a) => a.studentId === student.id)
  const open = data.trackers.filter((t) => !mine.some((a) => a.tracker.id === t.id))
  const [slug, setSlug] = useState('')
  const [start, setStart] = useState(today)
  const trackerId = useId()
  const startId = useId()
  const chosen = slug || open[0]?.slug || ''

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-small text-muted-foreground">Trackers</h4>
      {mine.length === 0 ? (
        <p className="text-muted-foreground">None yet.</p>
      ) : (
        <ul className="flex flex-col border-t border-border">
          {mine.map((a) => (
            <li
              key={a.id}
              style={{ '--tracker': `var(--tracker-${a.tracker.color})` } as CSSProperties}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border py-2"
            >
              <span className="flex items-center gap-2 text-foreground">
                <TrackerIcon name={a.tracker.icon} className="size-4 shrink-0 text-tracker" />
                {a.tracker.name}
                <span className="text-small text-muted-foreground">
                  {a.active ? `from ${formatDay(a.startDate)}` : 'paused'}
                </span>
              </span>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto px-0"
                disabled={pause.isPending}
                onClick={() => {
                  pause.mutate({ id: a.id, active: !a.active })
                }}
              >
                {a.active ? 'Pause' : 'Resume'}
                <span className="sr-only"> {a.tracker.name}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {open.length > 0 ? (
        <form
          aria-label={`Give ${student.name} a tracker`}
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!chosen || !start) return
            assign.mutate(
              { studentId: student.id, slug: chosen, start },
              {
                onSuccess: () => {
                  setSlug('')
                },
              },
            )
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={trackerId}>Tracker</Label>
            <select
              id={trackerId}
              value={chosen}
              onChange={(e) => {
                setSlug(e.target.value)
              }}
              className="h-11 rounded-md border border-input bg-card px-3 text-body text-foreground"
            >
              {open.map((t) => (
                <option key={t.id} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={startId}>Starts</Label>
            <Input
              id={startId}
              type="date"
              value={start}
              onChange={(e) => {
                setStart(e.target.value)
              }}
              className="w-44"
            />
          </div>
          <Button type="submit" variant="outline" disabled={assign.isPending}>
            {assign.isPending ? 'Assigning…' : 'Assign'}
          </Button>
        </form>
      ) : null}
      <Problem error={assign.error ?? pause.error} />
    </div>
  )
}

function SeenBy({ student, data }: { student: Person; data: People }) {
  const viewers = data.links
    .filter((l) => l.studentId === student.id)
    .map((l) => data.people.find((p) => p.id === l.viewerId)?.name)
    .filter(Boolean)
  return (
    <p className="text-small text-muted-foreground">
      {viewers.length > 0 ? `Seen by ${viewers.join(', ')}.` : 'No viewer follows them yet.'}
    </p>
  )
}

function ViewerLinks({ viewer, data }: { viewer: Person; data: People }) {
  const { link } = usePeopleWrites()
  const students = data.people.filter((p) => p.role === 'student')
  const labelId = useId()
  // What was asked for, per student, until it's saved and the list has reloaded.
  const [asked, setAsked] = useState<Readonly<Record<string, boolean>>>({})
  return (
    <fieldset className="flex flex-col gap-2" aria-labelledby={labelId}>
      <legend id={labelId} className="text-small text-muted-foreground">
        Sees
      </legend>
      {students.length === 0 ? (
        <p className="text-muted-foreground">No students yet.</p>
      ) : (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {students.map((student) => {
            const saved = data.links.some(
              (l) => l.viewerId === viewer.id && l.studentId === student.id,
            )
            const linked = asked[student.id] ?? saved
            return (
              <label key={student.id} className="flex items-center gap-2 text-foreground">
                <input
                  type="checkbox"
                  checked={linked}
                  disabled={student.id in asked}
                  onChange={() => {
                    setAsked((was) => ({ ...was, [student.id]: !linked }))
                    link.mutate(
                      { viewerId: viewer.id, studentId: student.id, linked: !linked },
                      {
                        onSettled: () => {
                          setAsked((was) =>
                            Object.fromEntries(
                              Object.entries(was).filter(([id]) => id !== student.id),
                            ),
                          )
                        },
                      },
                    )
                  }}
                  className="size-4 accent-primary"
                />
                {student.name}
              </label>
            )
          })}
        </div>
      )}
      <Problem error={link.error} />
    </fieldset>
  )
}

function AddPerson() {
  const { create } = usePeopleWrites()
  const headingId = useId()
  const nameId = useId()
  const emailId = useId()
  const passwordId = useId()
  const roleId = useId()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('student')
  const [password, setPassword] = useState(() => temporaryPassword())
  const [made, setMade] = useState<{ name: string; email: string; password: string } | null>(null)

  const submit = (event: SyntheticEvent) => {
    event.preventDefault()
    const input = { email, password, displayName: name, role }
    create.mutate(input, {
      onSuccess: () => {
        setMade({ name: name.trim(), email: email.trim(), password })
        setName('')
        setEmail('')
        setRole('student')
        setPassword(temporaryPassword())
      },
    })
  }

  return (
    <section aria-labelledby={headingId} className={sheet(false, 'gap-5')}>
      <h2 id={headingId} className="font-heading text-title text-foreground">
        Add a person
      </h2>
      <form
        onSubmit={submit}
        noValidate
        aria-labelledby={headingId}
        className="flex flex-col gap-5"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={nameId}>First name</Label>
            <Input
              id={nameId}
              value={name}
              maxLength={40}
              autoComplete="off"
              onChange={(e) => {
                setName(e.target.value)
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={emailId}>Email</Label>
            <Input
              id={emailId}
              type="email"
              value={email}
              autoComplete="off"
              onChange={(e) => {
                setEmail(e.target.value)
              }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span id={roleId} className="text-small font-medium text-foreground">
            Role
          </span>
          <Segmented
            name="new-role"
            options={ROLE_OPTIONS}
            value={role}
            onChange={(key) => {
              setRole(key as Role)
            }}
            labelId={roleId}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={passwordId}>Temporary password</Label>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              id={passwordId}
              value={password}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                setPassword(e.target.value)
              }}
              className="w-56 tabular-nums"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setPassword(temporaryPassword())
              }}
            >
              <RefreshCw aria-hidden />
              Another
            </Button>
          </div>
          <p className="text-small text-muted-foreground">
            Give it to them yourself. The app sends no email, and only you can set a new one.
          </p>
        </div>
        <Problem error={create.error} />
        <div>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Adding…' : 'Add'}
          </Button>
        </div>
      </form>
      <div role="status" className="empty:hidden">
        {made ? (
          <p className={note()}>
            {made.name} can sign in now with {made.email} and the password{' '}
            <span className="font-medium break-all tabular-nums">{made.password}</span>.
          </p>
        ) : null}
      </div>
    </section>
  )
}

function InlineForm({
  label,
  onSubmit,
  children,
  submit,
  busy,
  error,
  onCancel,
  danger = false,
}: {
  label: string
  onSubmit: () => void
  children?: ReactNode
  submit: string
  busy: boolean
  error: Error | null
  onCancel: () => void
  danger?: boolean
}) {
  return (
    <form
      aria-label={label}
      noValidate
      className={note(danger ? 'flex flex-col gap-3 border-destructive' : 'flex flex-col gap-3')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel()
      }}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      {children}
      <Problem error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" variant={danger ? 'danger' : 'default'} disabled={busy}>
          {submit}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function Rename({
  person,
  onDone,
  onCancel,
}: {
  person: Person
  onDone: () => void
  onCancel: () => void
}) {
  const { rename } = usePeopleWrites()
  const [name, setName] = useState(person.name)
  const id = useId()
  return (
    <InlineForm
      label={`Rename ${person.name}`}
      submit={rename.isPending ? 'Saving…' : 'Save'}
      busy={rename.isPending}
      error={rename.error}
      onCancel={onCancel}
      onSubmit={() => {
        const next = name.trim()
        if (!next) return
        rename.mutate({ id: person.id, name: next }, { onSuccess: onDone })
      }}
    >
      <Label htmlFor={id}>First name</Label>
      <Input
        id={id}
        value={name}
        maxLength={40}
        autoFocus
        onChange={(e) => {
          setName(e.target.value)
        }}
        className="max-w-xs"
      />
    </InlineForm>
  )
}

function NewPassword({
  person,
  onDone,
  onCancel,
}: {
  person: Person
  onDone: (message: ReactNode) => void
  onCancel: () => void
}) {
  const { setPassword } = usePeopleWrites()
  const [password, setValue] = useState(() => temporaryPassword())
  const id = useId()
  return (
    <InlineForm
      label={`New password for ${person.name}`}
      submit={setPassword.isPending ? 'Setting…' : 'Set password'}
      busy={setPassword.isPending}
      error={setPassword.error}
      onCancel={onCancel}
      onSubmit={() => {
        setPassword.mutate(
          { userId: person.id, password },
          {
            onSuccess: () => {
              onDone(
                <>
                  {person.name}’s password is now{' '}
                  <span className="font-medium break-all tabular-nums">{password}</span>. Their
                  other devices stay signed in.
                </>,
              )
            },
          },
        )
      }}
    >
      <Label htmlFor={id}>Temporary password</Label>
      <Input
        id={id}
        value={password}
        autoFocus
        spellCheck={false}
        onChange={(e) => {
          setValue(e.target.value)
        }}
        className="w-56 tabular-nums"
      />
    </InlineForm>
  )
}

function SetActive({
  person,
  onDone,
  onCancel,
}: {
  person: Person
  onDone: (message: ReactNode) => void
  onCancel: () => void
}) {
  const { setActive } = usePeopleWrites()
  const disabling = person.active
  return (
    <InlineForm
      label={`${disabling ? 'Disable' : 'Enable'} ${person.name}`}
      submit={disabling ? 'Disable' : 'Enable'}
      danger={disabling}
      busy={setActive.isPending}
      error={setActive.error}
      onCancel={onCancel}
      onSubmit={() => {
        setActive.mutate(
          { userId: person.id, active: !disabling },
          {
            onSuccess: () => {
              onDone(
                disabling
                  ? `${person.name} can’t sign in now. Everything they logged stays.`
                  : `${person.name} can sign in again.`,
              )
            },
          },
        )
      }}
    >
      <p className="text-foreground">
        {disabling
          ? `${person.name} won’t be able to sign in, and a device already signed in stops working within the hour. Nothing they logged is removed.`
          : `${person.name} will be able to sign in again with their password.`}
      </p>
    </InlineForm>
  )
}

function ChangeRole({
  person,
  onDone,
  onCancel,
}: {
  person: Person
  onDone: (message: ReactNode) => void
  onCancel: () => void
}) {
  const { setRole } = usePeopleWrites()
  const others = ROLE_OPTIONS.filter((r) => r.key !== person.role)
  const [role, setValue] = useState<Role>(others[0]?.key ?? 'viewer')
  const labelId = useId()
  return (
    <InlineForm
      label={`Change ${person.name}’s role`}
      submit={setRole.isPending ? 'Changing…' : 'Change role'}
      busy={setRole.isPending}
      error={setRole.error}
      onCancel={onCancel}
      onSubmit={() => {
        setRole.mutate(
          { userId: person.id, role },
          {
            onSuccess: () => {
              onDone(`${person.name} is now ${role === 'admin' ? 'an' : 'a'} ${role}.`)
            },
          },
        )
      }}
    >
      <span id={labelId} className="text-small font-medium text-foreground">
        New role
      </span>
      <Segmented
        name={`role-${person.id}`}
        options={others}
        value={role}
        onChange={(key) => {
          setValue(key as Role)
        }}
        labelId={labelId}
      />
    </InlineForm>
  )
}

function Problem({ error }: { error: Error | null }) {
  return error ? (
    <p role="alert" className="text-small text-destructive">
      {error.message}
    </p>
  ) : null
}
