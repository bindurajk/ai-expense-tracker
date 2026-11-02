import type { ReactNode } from 'react'
import { Link, Outlet } from 'react-router-dom'

// Layout for pages anyone can see: landing, sign in/up, help, privacy.
export function PublicLayout({ children }: { children?: ReactNode }) {
  return (
    <div className="public-shell">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <header className="site-header">
        <Link to="/" className="brand">
          SpendWise
        </Link>
        <nav aria-label="Site" className="site-nav">
          <Link to="/help">Help</Link>
          <Link to="/login">Sign in</Link>
          <Link to="/signup" className="button button-primary">
            Sign up
          </Link>
        </nav>
      </header>
      <main id="main" className="public-main">
        {children ?? <Outlet />}
      </main>
      <footer className="site-footer">
        <Link to="/privacy">Privacy</Link>
        <Link to="/help">Help</Link>
        <span className="muted">GBP only · UK dates</span>
      </footer>
    </div>
  )
}
