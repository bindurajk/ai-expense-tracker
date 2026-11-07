import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { safeNextPath } from '../auth/nextPath'
import { usePageTitle } from '../usePageTitle'

// Placeholders for sign-in (A02) and password reset (A03).
// Sign-up and email verification (A01) live in Signup.tsx and Verify.tsx.

export function Login() {
  usePageTitle('Sign in')
  const { config, demoAllowed, startDemo } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  function preview() {
    startDemo()
    navigate(safeNextPath(params.get('next')), { replace: true })
  }

  return (
    <section className="page narrow">
      <h1>Sign in</h1>
      <p className="placeholder-note">The sign-in form will be built in feature A02.</p>
      {!config.ok && (
        <p className="notice notice-warning" role="status">
          Sign-in is not available yet because the app is not fully set up.
        </p>
      )}
      {demoAllowed && (
        <div className="dev-box">
          <p>
            <strong>Development only:</strong> preview the signed-in layout with an empty demo
            account. Nothing is saved.
          </p>
          <button type="button" className="button button-secondary" onClick={preview}>
            Preview the app layout
          </button>
        </div>
      )}
      <p>
        New here? <Link to="/signup">Create an account</Link>
      </p>
    </section>
  )
}

export function ResetPassword() {
  usePageTitle('Reset password')
  return (
    <section className="page narrow">
      <h1>Reset your password</h1>
      <p className="placeholder-note">Password reset will be built in feature A03.</p>
      <p>
        <Link to="/login">Back to sign in</Link>
      </p>
    </section>
  )
}
