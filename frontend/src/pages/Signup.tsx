import { zodResolver } from '@hookform/resolvers/zod'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '../auth/AuthContext'
import { emailSchema, mapAuthError, type MappedAuthError } from '../auth/authErrors'
import { Field } from '../components/Field'
import { ApiError } from '../lib/api'
import { usePageTitle } from '../usePageTitle'

const passwordSchema = z
  .string()
  .min(8, { error: 'Your password must be at least 8 characters' })
  .max(128, { error: 'Your password can be at most 128 characters' })

const signupSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, { error: 'Type your password again' }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    error: 'The passwords do not match',
  })

type SignupInput = z.input<typeof signupSchema>
type SignupValues = z.output<typeof signupSchema>

export function Signup() {
  usePageTitle('Sign up')
  const { status, signUp } = useAuth()
  const navigate = useNavigate()
  const [formError, setFormError] = useState<MappedAuthError | null>(null)
  const inFlight = useRef(false)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput, unknown, SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
  })

  if (status === 'signed-in') return <Navigate to="/dashboard" replace />

  async function onSubmit(values: SignupValues) {
    if (inFlight.current) return
    inFlight.current = true
    setFormError(null)
    try {
      await signUp(values.email, values.password)
      navigate('/dashboard', { replace: true })
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null
      const fields = apiError?.status === 422 ? apiError.fieldErrors : undefined
      const fieldNames = (['email', 'password'] as const).filter((name) => fields?.[name])
      if (fields && fieldNames.length > 0) {
        fieldNames.forEach((name, i) =>
          setError(name, { type: 'server', message: fields[name] }, { shouldFocus: i === 0 }),
        )
      } else {
        setFormError(mapAuthError(apiError))
      }
    } finally {
      inFlight.current = false
    }
  }

  return (
    <section className="page narrow">
      <h1>Create your account</h1>
      <form className="form" noValidate onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
        <fieldset>
          <legend className="visually-hidden">Your sign-up details</legend>
          {formError && (
            <div className="notice notice-error" role="alert">
              {formError.message}
              {formError.kind === 'account_exists' && (
                <>
                  {' '}
                  <Link to="/login">Go to sign in</Link>
                </>
              )}
            </div>
          )}
          <Field
            id="signup-email"
            label="Email address"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            registration={register('email')}
          />
          <Field
            id="signup-password"
            label="Password"
            type="password"
            autoComplete="new-password"
            hint="At least 8 characters."
            error={errors.password?.message}
            registration={register('password')}
          />
          <Field
            id="signup-confirm"
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            registration={register('confirmPassword')}
          />
          <button type="submit" className="button button-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Creating your account…' : 'Create account'}
          </button>
          <p className="visually-hidden" role="status">
            {isSubmitting ? 'Creating your account…' : ''}
          </p>
        </fieldset>
      </form>
      <p>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </section>
  )
}
