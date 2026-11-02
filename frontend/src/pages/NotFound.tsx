import { Link } from 'react-router-dom'
import { usePageTitle } from '../usePageTitle'

export function NotFound() {
  usePageTitle('Page not found')
  return (
    <section className="page narrow">
      <h1>Page not found</h1>
      <p>We couldn&apos;t find that page.</p>
      <p>
        <Link to="/">Go to the home page</Link>
      </p>
    </section>
  )
}
