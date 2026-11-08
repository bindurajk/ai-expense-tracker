import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { PublicLayout } from '../layouts/PublicLayout'
import { SetupError } from '../pages/SetupError'
import { useAuth } from './AuthContext'
import { safeNextPath } from './nextPath'

// Guards every private page. Order matters:
// 1. still checking the session with the server → say so (never flash private content or the sign-in page)
// 2. signed in → show the page
// 3. server not set up or not reachable → explain that instead of a confusing sign-in loop
// 4. signed out → go to sign in, remembering where the person was heading
export function ProtectedRoute() {
  const { session, status, serviceProblem } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <PublicLayout>
        <section className="page narrow">
          <p role="status">Checking you are signed in…</p>
        </section>
      </PublicLayout>
    )
  }

  if (session) return <Outlet />

  if (serviceProblem) {
    return (
      <PublicLayout>
        <SetupError problem={serviceProblem} />
      </PublicLayout>
    )
  }

  const next = safeNextPath(location.pathname + location.search)
  return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
}
