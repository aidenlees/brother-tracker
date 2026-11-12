import { useEffect, useId, useState, type ReactNode, type SubmitEvent } from 'react'
import { Navigate, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { note } from '@/components/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth, type SignInResult } from '@/lib/auth-context'
import { homeFor } from '../nav'

/**
 * Email and password only. Accounts come from the admin, so there is no sign-up,
 * magic link or reset flow (CLAUDE.md, "Login").
 */
export function LoginPage() {
  const auth = useAuth()
  const location = useLocation()

  useEffect(() => {
    document.title = 'Sign in – Practice tracker'
  }, [])

  if (auth.status === 'signed-in') {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from ?? homeFor(auth.profile.role)} replace />
  }

  return (
    <main className="flex min-h-dvh items-start justify-center px-6 py-16 sm:items-center">
      {/* The margin rule of a notebook's first page. */}
      <div className="w-full max-w-sm border-l-2 border-tracker-ink-blue/60 pl-6 sm:pl-10">
        <h1 className="font-heading text-display text-foreground">Practice tracker</h1>
        {auth.status === 'needs-code' ? (
          <CodeForm onVerify={auth.verifyCode} onCancel={auth.signOut} />
        ) : (
          <PasswordForm
            onSignIn={auth.signIn}
            notice={auth.status === 'signed-out' ? auth.notice : undefined}
            busy={auth.status === 'loading'}
          />
        )}
      </div>
    </main>
  )
}

/** `missing` names what's empty, if anything, so the button never has to be disabled. */
function useSubmit(action: () => Promise<SignInResult>, missing: () => string | null) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const problem = missing()
    if (problem) {
      setError(problem)
      return
    }
    setPending(true)
    setError(null)
    const result = await action()
    setPending(false)
    if (!result.ok) setError(result.message)
  }
  return { pending, error, submit }
}

function PasswordForm({
  onSignIn,
  notice,
  busy,
}: {
  onSignIn: (email: string, password: string) => Promise<SignInResult>
  notice?: string | undefined
  busy: boolean
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { pending, error, submit } = useSubmit(
    () => onSignIn(email.trim(), password),
    () =>
      !email.trim() && !password
        ? 'Enter your email and password.'
        : !email.trim()
          ? 'Enter your email.'
          : !password
            ? 'Enter your password.'
            : null,
  )

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-10 flex flex-col gap-5" noValidate>
      {notice ? <Notice>{notice}</Notice> : null}
      <Field label="Email" error={error}>
        {(props) => (
          <Input
            {...props}
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
            }}
          />
        )}
      </Field>
      <Field label="Password" error={error}>
        {(props) => (
          <Input
            {...props}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
            }}
          />
        )}
      </Field>
      <div className="mt-3 flex flex-col items-start gap-6">
        <ErrorText message={error} />
        <Button type="submit" size="lg" disabled={busy}>
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
        <p className="text-small text-muted-foreground">Forgot it? Ask your admin to reset it.</p>
      </div>
    </form>
  )
}

function CodeForm({
  onVerify,
  onCancel,
}: {
  onVerify: (code: string) => Promise<SignInResult>
  onCancel: () => Promise<void>
}) {
  const [code, setCode] = useState('')
  const { pending, error, submit } = useSubmit(
    () => onVerify(code),
    () => (code.length === 6 ? null : 'Enter all 6 digits of the code.'),
  )

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-10 flex flex-col gap-5" noValidate>
      <p className="text-foreground">
        Open your authenticator app and enter the 6-digit code for Practice tracker.
      </p>
      <Field label="Code" error={error}>
        {(props) => (
          <Input
            {...props}
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoFocus
            className="max-w-40 text-lead tracking-widest tabular-nums"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, ''))
            }}
          />
        )}
      </Field>
      <ErrorText message={error} />
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg">
          {pending ? 'Checking…' : 'Verify'}
        </Button>
        <Button type="button" variant="link" onClick={() => void onCancel()}>
          Use a different account
        </Button>
      </div>
    </form>
  )
}

type FieldProps = { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }

function Field({
  label,
  error,
  children,
}: {
  label: string
  error: string | null
  children: (props: FieldProps) => ReactNode
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        'aria-invalid': error !== null,
        'aria-describedby': error ? 'form-error' : undefined,
      })}
    </div>
  )
}

/**
 * The visible message takes no space until there is one. Screen readers hear it through
 * a live region that is always in the page, so the announcement never gets lost.
 */
function ErrorText({ message }: { message: string | null }) {
  return (
    <>
      <p role="alert" className="sr-only">
        {message}
      </p>
      {message ? (
        <p id="form-error" aria-hidden="true" className="text-small text-destructive">
          {message}
        </p>
      ) : null}
    </>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className={note()}>
      {children}
    </p>
  )
}
