import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { safeNextPath } from '../auth/nextPath'
import { usePageTitle } from '../usePageTitle'

// Placeholders for the sign-in pages. The real forms use Supabase Auth and arrive in A01–A03.

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

export function Signup() {
  usePageTitle('Sign up')
  return (
    <section className="page narrow">
      <h1>Create your account</h1>
      <p className="placeholder-note">The sign-up form will be built in feature A01.</p>
      <p>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </section>
  )
}

export function Verify() {
  usePageTitle('Verify your email')
  return (
    <section className="page narrow">
      <h1>Check your email</h1>
      <p className="placeholder-note">Email verification will be built in feature A01.</p>
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
