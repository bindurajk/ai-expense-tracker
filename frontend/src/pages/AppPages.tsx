import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { usePageTitle } from '../usePageTitle'

// Placeholders for signed-in pages. Each one is replaced by the feature named on it.
// They show an empty state only — never invented sample transactions.

function PagePlaceholder({ title, featureId, text }: { title: string; featureId: string; text: string }) {
  usePageTitle(title)
  return (
    <section className="page">
      <h1>{title}</h1>
      <div className="empty-state">
        <p>{text}</p>
        <p className="placeholder-note">This page will be built in feature {featureId}.</p>
      </div>
    </section>
  )
}

export const Dashboard = () => (
  <PagePlaceholder title="Dashboard" featureId="D02" text="Your monthly totals will appear here." />
)
export const Transactions = () => (
  <PagePlaceholder title="Transactions" featureId="T04" text="Your recorded entries will be listed here." />
)
export const NewTransaction = () => (
  <PagePlaceholder title="Add entry" featureId="T01" text="Record an expense, income or refund." />
)
export const EditTransaction = () => (
  <PagePlaceholder title="Edit entry" featureId="T05" text="Correct a recorded entry." />
)
export const Budgets = () => (
  <PagePlaceholder title="Budgets" featureId="B01" text="Set monthly limits for your spending categories." />
)
export const Categories = () => (
  <PagePlaceholder title="Categories" featureId="C02" text="Add, rename and archive your categories." />
)
export const Insights = () => (
  <PagePlaceholder title="Insights" featureId="I01" text="Plain facts about your recorded month." />
)
export const Settings = () => (
  <PagePlaceholder title="Settings" featureId="X01" text="Preferences, exports and account options." />
)
export const Onboarding = () => (
  <PagePlaceholder title="Get started" featureId="A05" text="A short setup you can skip." />
)

export function More() {
  usePageTitle('More')
  const { signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <section className="page">
      <h1>More</h1>
      <ul className="link-list">
        <li>
          <Link to="/categories">Categories</Link>
        </li>
        <li>
          <Link to="/insights">Insights</Link>
        </li>
        <li>
          <Link to="/settings">Settings</Link>
        </li>
        <li>
          <Link to="/help">Help</Link>
        </li>
        <li>
          <Link to="/privacy">Privacy</Link>
        </li>
      </ul>
      <button
        type="button"
        className="button button-secondary"
        onClick={() => {
          navigate('/', { replace: true })
          signOut()
        }}
      >
        Sign out
      </button>
    </section>
  )
}
