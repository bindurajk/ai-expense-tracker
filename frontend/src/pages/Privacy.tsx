import { usePageTitle } from '../usePageTitle'

// LAUNCH BLOCKER: this must be replaced with the real privacy notice before any real user signs up
// (operator, contact, processors, lawful bases, retention, rights). See PRD section 10.
export function Privacy() {
  usePageTitle('Privacy')
  return (
    <article className="page prose">
      <h1>Privacy notice</h1>
      <p className="placeholder-note" role="note">
        Placeholder. The real privacy notice must be written before launch. Do not enter real
        financial information yet.
      </p>
      <h2>What we plan to collect</h2>
      <ul>
        <li>Your email address, to sign you in.</li>
        <li>The entries, categories and budgets you type in.</li>
      </ul>
      <h2>What we never ask for</h2>
      <ul>
        <li>Bank logins, card numbers or account numbers.</li>
        <li>Your date of birth, address or phone number.</li>
      </ul>
    </article>
  )
}
