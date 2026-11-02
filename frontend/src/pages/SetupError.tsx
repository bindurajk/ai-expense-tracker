import { Link } from 'react-router-dom'
import { usePageTitle } from '../usePageTitle'

// Shown instead of a crash when required settings are missing.
// It names the missing setting but never shows any secret or key value.
export function SetupError({ problems }: { problems: string[] }) {
  usePageTitle('Setup needed')
  return (
    <section className="page narrow">
      <h1>The app is not set up yet</h1>
      <div className="notice notice-error" role="alert">
        <p>SpendWise can&apos;t open private pages until its settings are filled in:</p>
        <ul>
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
      <p>
        To fix this, copy <code>frontend/.env.example</code> to <code>frontend/.env.local</code>, fill
        in the values, then restart the app.
      </p>
      <p>
        <Link to="/">Back to the home page</Link>
      </p>
    </section>
  )
}
