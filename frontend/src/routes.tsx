import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AppLayout } from './layouts/AppLayout'
import { PublicLayout } from './layouts/PublicLayout'
import {
  Budgets,
  Categories,
  Dashboard,
  EditTransaction,
  Insights,
  More,
  Onboarding,
  Settings,
  Transactions,
} from './pages/AppPages'
import { Login, ResetPassword } from './pages/AuthPages'
import { Help } from './pages/Help'
import { Landing } from './pages/Landing'
import { NewTransaction } from './pages/NewTransaction'
import { NotFound } from './pages/NotFound'
import { Privacy } from './pages/Privacy'
import { Signup } from './pages/Signup'

// All MVP routes from PRD section 5. P2 pages (goals, recurring, notifications, reports)
// are intentionally absent until those modules pass their gate.
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Landing />} />
        <Route path="signup" element={<Signup />} />
        <Route path="login" element={<Login />} />
        {/* Email verification was removed; old links go to sign in. */}
        <Route path="verify" element={<Navigate to="/login" replace />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="help" element={<Help />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="onboarding" element={<Onboarding />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="transactions/new" element={<NewTransaction />} />
          <Route path="transactions/:id/edit" element={<EditTransaction />} />
          <Route path="budgets" element={<Budgets />} />
          <Route path="categories" element={<Categories />} />
          <Route path="insights" element={<Insights />} />
          <Route path="settings" element={<Settings />} />
          <Route path="more" element={<More />} />
        </Route>
      </Route>
    </Routes>
  )
}
