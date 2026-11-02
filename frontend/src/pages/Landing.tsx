import { Link } from 'react-router-dom'
import { usePageTitle } from '../usePageTitle'

export function Landing() {
  usePageTitle('Welcome')
  return (
    <section className="page hero">
      <h1>Know where your money goes each month</h1>
      <p className="lead">
        Record what you earn and spend, see your monthly limits, and get a clear explanation of your
        recorded spending.
      </p>
      <ul className="facts">
        <li>You type in each entry yourself. SpendWise does not connect to your bank.</li>
        <li>Amounts are in pounds sterling (GBP) only, with UK dates.</li>
        <li>Totals are based on your entries. They are not your bank balance.</li>
      </ul>
      <div className="actions">
        <Link to="/signup" className="button button-primary">
          Create a free account
        </Link>
        <Link to="/login" className="button button-secondary">
          Sign in
        </Link>
      </div>
      <p className="muted">
        Read how we handle your data in our <Link to="/privacy">privacy notice</Link>.
      </p>
    </section>
  )
}
