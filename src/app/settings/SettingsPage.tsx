import { useId, useState, type ReactNode, type SyntheticEvent } from 'react'
import { Page } from '@/components/Page'
import { sheet } from '@/components/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth-context'
import { useTheme, type Theme } from '@/lib/theme'
import { groupKey, qrSource, useTwoStep, useTwoStepWrites, type Setup } from '@/lib/two-step'
import { Segmented } from '@/trackers/fields/controls'

const THEME_OPTIONS: { key: Theme; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
]

/** Settings (everyone): the theme on this device; for the admin, two-step sign-in. */
export function SettingsPage() {
  const auth = useAuth()
  const role = auth.status === 'signed-in' ? auth.profile.role : null
  return (
    <Page title="Settings">
      <ThemeSetting />
      {role === 'admin' ? <TwoStepSetting /> : null}
    </Page>
  )
}

function Card({
  title,
  children,
  headingId,
}: {
  title: string
  children: ReactNode
  headingId: string
}) {
  return (
    <section aria-labelledby={headingId} className={sheet()}>
      <h2 id={headingId} className="font-heading text-title text-foreground">
        {title}
      </h2>
      {children}
    </section>
  )
}

function ThemeSetting() {
  const headingId = useId()
  const hintId = useId()
  const [theme, setTheme] = useTheme()
  return (
    <Card title="Theme" headingId={headingId}>
      <div className="flex flex-col gap-3">
        <Segmented
          name="theme"
          options={THEME_OPTIONS}
          value={theme}
          onChange={(key) => {
            setTheme(key as Theme)
          }}
          labelId={headingId}
          describedBy={hintId}
        />
        <p id={hintId} className="text-small text-muted-foreground">
          Saved on this device. System follows the device’s own light or dark setting.
        </p>
      </div>
    </Card>
  )
}

function TwoStepSetting() {
  const headingId = useId()
  const status = useTwoStep()
  const [setup, setSetup] = useState<Setup | null>(null)
  const [turningOff, setTurningOff] = useState(false)
  const [done, setDone] = useState('')

  let body: ReactNode
  if (status.status === 'pending') {
    body = (
      <p role="status" className="text-muted-foreground">
        Checking…
      </p>
    )
  } else if (status.status === 'error') {
    body = (
      <div className="flex flex-col items-start gap-3">
        <p className="text-foreground">{status.error.message}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void status.refetch()}>
          Try again
        </Button>
      </div>
    )
  } else if (setup) {
    body = (
      <SetUp
        setup={setup}
        onDone={() => {
          setSetup(null)
          setDone('Two-step sign-in is on.')
        }}
        onCancel={() => {
          setSetup(null)
        }}
      />
    )
  } else if (status.data.on && status.data.factorId) {
    const factorId = status.data.factorId
    body = turningOff ? (
      <TurnOff
        factorId={factorId}
        onDone={() => {
          setTurningOff(false)
          setDone('Two-step sign-in is off.')
        }}
        onCancel={() => {
          setTurningOff(false)
        }}
      />
    ) : (
      <div className="flex flex-col items-start gap-4">
        <p className="text-foreground">
          On. Each new sign-in asks for a 6-digit code from the authenticator app on your phone.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setDone('')
            setTurningOff(true)
          }}
        >
          Turn off
        </Button>
        <p className="text-small text-muted-foreground">
          Lost your phone? Remove the app in the Supabase dashboard (Authentication, Users, your
          account, its MFA factor), then sign in with your password and set it up again.
        </p>
      </div>
    )
  } else {
    body = (
      <TurnOn
        onStarted={(next) => {
          setDone('')
          setSetup(next)
        }}
      />
    )
  }

  return (
    <Card title="Two-step sign-in" headingId={headingId}>
      {body}
      <p role="status" className="sr-only empty:hidden">
        {done}
      </p>
    </Card>
  )
}

function TurnOn({ onStarted }: { onStarted: (setup: Setup) => void }) {
  const { start } = useTwoStepWrites()
  return (
    <div className="flex flex-col items-start gap-4">
      <p className="text-foreground">
        Off. Signing in asks only for your password. Turn it on and each new sign-in also asks for a
        6-digit code from an authenticator app on your phone.
      </p>
      <Button
        type="button"
        variant="outline"
        disabled={start.isPending}
        onClick={() => {
          start.mutate(undefined, { onSuccess: onStarted })
        }}
      >
        {start.isPending ? 'Starting…' : 'Turn on two-step sign-in'}
      </Button>
      <Problem error={start.error} />
    </div>
  )
}

function SetUp({
  setup,
  onDone,
  onCancel,
}: {
  setup: Setup
  onDone: () => void
  onCancel: () => void
}) {
  const { confirm, cancel } = useTwoStepWrites()
  const [code, setCode] = useState('')
  const [missing, setMissing] = useState(false)

  const submit = (event: SyntheticEvent) => {
    event.preventDefault()
    if (code.length !== 6) {
      setMissing(true)
      return
    }
    setMissing(false)
    confirm.mutate({ factorId: setup.factorId, code }, { onSuccess: onDone })
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <ol className="flex list-decimal flex-col gap-6 pl-5 marker:text-muted-foreground">
        <li className="flex flex-col gap-3 pl-1">
          <p className="text-foreground">Scan this code with an authenticator app on your phone.</p>
          <img
            src={qrSource(setup.qr)}
            alt="QR code for your authenticator app"
            className="size-52 rounded-md border border-border bg-scan-paper p-4"
          />
          <p className="text-small text-muted-foreground">
            Can’t scan it? Type this key into the app instead:{' '}
            <span className="font-medium break-all text-foreground tabular-nums">
              {groupKey(setup.key)}
            </span>
          </p>
        </li>
        <li className="flex flex-col gap-3 pl-1">
          <CodeInput
            label="Enter the 6-digit code the app shows"
            value={code}
            onChange={setCode}
            invalid={missing || confirm.isError}
          />
        </li>
      </ol>
      {missing ? (
        <p className="text-small text-destructive">Enter all 6 digits of the code.</p>
      ) : null}
      <Problem error={confirm.error} />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={confirm.isPending}>
          {confirm.isPending ? 'Checking…' : 'Turn on'}
        </Button>
        <Button
          type="button"
          variant="link"
          disabled={confirm.isPending || cancel.isPending}
          onClick={() => {
            cancel.mutate(undefined, { onSettled: onCancel })
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

function TurnOff({
  factorId,
  onDone,
  onCancel,
}: {
  factorId: string
  onDone: () => void
  onCancel: () => void
}) {
  const { turnOff } = useTwoStepWrites()
  const [code, setCode] = useState('')
  const [missing, setMissing] = useState(false)

  const submit = (event: SyntheticEvent) => {
    event.preventDefault()
    if (code.length !== 6) {
      setMissing(true)
      return
    }
    setMissing(false)
    turnOff.mutate({ factorId, code }, { onSuccess: onDone })
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <p className="text-foreground">
        To turn it off, enter a code from your authenticator app. Signing in will then ask only for
        your password.
      </p>
      <CodeInput
        label="Code"
        value={code}
        onChange={setCode}
        invalid={missing || turnOff.isError}
        autoFocus
      />
      {missing ? (
        <p className="text-small text-destructive">Enter all 6 digits of the code.</p>
      ) : null}
      <Problem error={turnOff.error} />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="danger" disabled={turnOff.isPending}>
          {turnOff.isPending ? 'Turning off…' : 'Turn off'}
        </Button>
        <Button type="button" variant="link" onClick={onCancel}>
          Keep it on
        </Button>
      </div>
    </form>
  )
}

function CodeInput({
  label,
  value,
  onChange,
  invalid,
  autoFocus = false,
}: {
  label: string
  value: string
  onChange: (code: string) => void
  invalid: boolean
  autoFocus?: boolean
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        autoComplete="one-time-code"
        inputMode="numeric"
        pattern="[0-9]{6}"
        maxLength={6}
        autoFocus={autoFocus}
        aria-invalid={invalid}
        className="max-w-40 text-lead tracking-widest tabular-nums"
        value={value}
        onChange={(e) => {
          onChange(e.target.value.replace(/\D/g, ''))
        }}
      />
    </div>
  )
}

function Problem({ error }: { error: Error | null }) {
  return error ? (
    <p role="alert" className="text-small text-destructive">
      {error.message}
    </p>
  ) : null
}
