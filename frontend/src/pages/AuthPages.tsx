import { zodResolver } from '@hookform/resolvers/zod'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '../auth/AuthContext'
import { emailSchema, mapAuthError } from '../auth/authErrors'
import { safeNextPath } from '../auth/nextPath'
import { Field } from '../components/Field'
import { ApiError } from '../lib/api'
import { usePageTitle } from '../usePageTitle'

// Sign-in (A02) and the password reset placeholder (A03). Sign-up lives in Signup.tsx.

const loginSchema = z.object({
  email: emailSchema,
  // Only "not empty" here: the server decides whether the password is right.
  password: z.string().min(1, { error: 'Enter your password' }),
})

type LoginInput = z.input<typeof loginSchema>
type LoginValues = z.output<typeof loginSchema>

export function Login() {
  usePageTitle('Sign in')
  const { status, demoAllowed, startDemo, signIn } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNextPath(params.get('next'))
  const [formError, setFormError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput, unknown, LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  // Already signed in (or just signed in): go where the person was heading.
  if (status === 'signed-in') return <Navigate to={next} replace />

  function preview() {
    startDemo()
    navigate(next, { replace: true })
  }

  async function onSubmit(values: LoginValues) {
    if (inFlight.current) return
    inFlight.current = true
    setFormError(null)
    try {
      await signIn(values.email, values.password)
      navigate(next, { replace: true })
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null
      const emailProblem = apiError?.status === 422 ? apiError.fieldErrors?.email : undefined
      if (emailProblem) {
        setError('email', { type: 'server', message: emailProblem }, { shouldFocus: true })
      } else {
        // 401 and 422-on-password both get the generic "Email or password is incorrect." style message.
        setFormError(mapAuthError(apiError?.status === 422 ? { code: 'invalid_credentials' } : apiError).message)
      }
    } finally {
      inFlight.current = false
    }
  }

  return (
    <section className="page narrow">
      <h1>Sign in</h1>
      <form className="form" noValidate onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
        <fieldset>
          <legend className="visually-hidden">Your sign-in details</legend>
          {formError && (
            <div className="notice notice-error" role="alert">
              {formError}
            </div>
          )}
          <Field
            id="login-email"
            label="Email address"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            registration={register('email')}
          />
          <Field
            id="login-password"
            label="Password"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            registration={register('password')}
          />
          <button type="submit" className="button button-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="visually-hidden" role="status">
            {isSubmitting ? 'Signing in…' : ''}
          </p>
        </fieldset>
      </form>
      <p>
        <Link to="/reset-password">Forgot your password?</Link>
      </p>
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
      <p>Password reset is not available yet. We&apos;re working on it.</p>
      <p>
        <Link to="/login">Back to sign in</Link>
      </p>
    </section>
  )
}
