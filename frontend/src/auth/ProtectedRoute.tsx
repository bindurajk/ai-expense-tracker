import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { PublicLayout } from '../layouts/PublicLayout'
import { SetupError } from '../pages/SetupError'
import { useAuth } from './AuthContext'

// Guards every private page. Order matters:
// 1. still checking the saved session → say so (never flash private content or the sign-in page)
// 2. signed in but email not verified → go to /verify (no finance pages or navigation)
// 3. signed in → show the page
// 4. app not configured → explain the setup problem instead of crashing
// 5. signed out → go to sign in, remembering where the person was heading
export function ProtectedRoute() {
  const { config, session, status } = useAuth()
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

  if (session?.kind === 'supabase' && !session.emailVerified) {
    return <Navigate to="/verify" replace />
  }

  if (session) return <Outlet />

  if (!config.ok) {
    return (
      <PublicLayout>
        <SetupError problems={config.problems} />
      </PublicLayout>
    )
  }

  const next = location.pathname + location.search
  return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
}
