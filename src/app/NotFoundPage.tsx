import { Link } from 'react-router'
import { Page } from '@/components/Page'
import { useAuth } from '@/lib/auth-context'
import { homeFor, navFor } from './nav'

export function NotFoundPage() {
  const auth = useAuth()
  const home = auth.status === 'signed-in' ? homeFor(auth.profile.role) : '/login'
  const homeLabel =
    auth.status === 'signed-in'
      ? (navFor(auth.profile.role).find((s) => `/${s.path}` === home)?.label ?? 'home')
      : 'sign in'

  return (
    <Page title="Page not found" lead="There’s no page at this address.">
      <p>
        <Link to={home} className="underline underline-offset-4">
          Go to {homeLabel}
        </Link>
      </p>
    </Page>
  )
}
