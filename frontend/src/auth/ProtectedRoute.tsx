import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { PublicLayout } from '../layouts/PublicLayout'
import { SetupError } from '../pages/SetupError'
import { useAuth } from './AuthContext'

// Guards every private page. Order matters:
// 1. signed in → show the page
// 2. app not configured → explain the setup problem instead of crashing
// 3. signed out → go to sign in, remembering where the person was heading
export function ProtectedRoute() {
  const { config, session } = useAuth()
  const location = useLocation()

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
