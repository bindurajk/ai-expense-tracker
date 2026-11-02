import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const MORE_PATHS = ['/more', '/categories', '/insights', '/settings']

// The three pages where the "Add entry" shortcut must be reachable (PRD section 5).
const ADD_ENTRY_PATHS = ['/dashboard', '/transactions', '/budgets']

function NavItems() {
  const { pathname } = useLocation()
  const moreActive = MORE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  return (
    <ul className="nav-list">
      <li>
        <NavLink to="/dashboard">Dashboard</NavLink>
      </li>
      <li>
        <NavLink to="/transactions">Transactions</NavLink>
      </li>
      <li>
        <NavLink to="/budgets">Budgets</NavLink>
      </li>
      <li>
        <NavLink
          to="/more"
          className={moreActive ? 'active' : undefined}
          aria-current={moreActive ? 'page' : undefined}
        >
          More
        </NavLink>
      </li>
    </ul>
  )
}

// Layout for signed-in pages. Phones get a bottom tab bar; wider screens get top navigation.
export function AppLayout() {
  const { session, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const showAddEntry = ADD_ENTRY_PATHS.includes(pathname)

  function handleSignOut() {
    // Leave the private page first, otherwise the route guard sends us to sign in instead.
    navigate('/', { replace: true })
    signOut()
  }

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      {session?.kind === 'demo' && (
        <p className="demo-banner" role="note">
          Development preview: this is not a real account and nothing is saved.
        </p>
      )}
      <header className="app-header">
        <Link to="/dashboard" className="brand">
          SpendWise
        </Link>
        <nav aria-label="Main" className="top-nav">
          <NavItems />
        </nav>
        <div className="header-actions">
          {showAddEntry && (
            <Link to="/transactions/new" className="button button-primary">
              Add entry
            </Link>
          )}
          <button type="button" className="button button-ghost desktop-only" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>
      <main id="main" className="app-main">
        <Outlet />
      </main>
      <nav aria-label="Main" className="bottom-nav">
        <NavItems />
      </nav>
    </div>
  )
}
