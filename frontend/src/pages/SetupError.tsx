import { Link } from 'react-router-dom'
import { usePageTitle } from '../usePageTitle'

// Shown instead of a crash or a sign-in loop when the SpendWise backend is not running
// or not configured. It never shows server details, keys or error dumps.
export function SetupError({ problem }: { problem: string }) {
  usePageTitle('Setup needed')
  return (
    <section className="page narrow">
      <h1>The app is not set up yet</h1>
      <div className="notice notice-error" role="alert">
        <p>SpendWise can&apos;t open private pages right now. {problem}</p>
      </div>
      <p>
        This usually means the backend server isn&apos;t running or isn&apos;t configured. Start it
        (see the README for the steps), then reload this page.
      </p>
      <p>
        <Link to="/">Back to the home page</Link>
      </p>
    </section>
  )
}
