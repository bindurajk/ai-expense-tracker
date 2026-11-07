import { zodResolver } from '@hookform/resolvers/zod'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '../auth/AuthContext'
import { emailSchema, GENERIC_MESSAGE, mapAuthError } from '../auth/authErrors'
import { Field } from '../components/Field'
import { usePageTitle } from '../usePageTitle'

const signupSchema = z
  .object({
    email: emailSchema,
    password: z
      .string()
      .min(8, { error: 'Your password must be at least 8 characters' })
      .max(72, { error: 'Your password can be at most 72 characters' }),
    confirmPassword: z.string().min(1, { error: 'Type your password again' }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    error: 'The passwords do not match',
  })

type SignupInput = z.input<typeof signupSchema>
type SignupValues = z.output<typeof signupSchema>

// What /verify receives. The email travels in router state only, never in the web address.
export type VerifyRouteState = { email?: string; justSignedUp?: boolean }

export function Signup() {
  usePageTitle('Sign up')
  const { client } = useAuth()
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
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

  async function onSubmit(values: SignupValues) {
    if (!client || inFlight.current) return
    inFlight.current = true
    setFormError(null)
    try {
      const { error } = await client.signUp({
        email: values.email,
        password: values.password,
        options: { emailRedirectTo: `${window.location.origin}/verify` },
      })
      if (!error) {
        // Supabase gives the same answer whether or not the email already has an account,
        // so everyone sees the same "Check your email" page.
        const state: VerifyRouteState = { email: values.email, justSignedUp: true }
        navigate('/verify', { state })
        return
      }
      const mapped = mapAuthError(error)
      if (mapped.field) {
        setError(mapped.field, { type: 'server', message: mapped.message }, { shouldFocus: true })
      } else {
        setFormError(mapped.message)
      }
    } catch {
      setFormError(GENERIC_MESSAGE)
    } finally {
      inFlight.current = false
    }
  }

  const disabled = !client

  return (
    <section className="page narrow">
      <h1>Create your account</h1>
      {disabled && (
        <p className="notice notice-warning" role="status">
          Sign-up is not available yet because the app is not fully set up.
        </p>
      )}
      <form className="form" noValidate onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
        <fieldset disabled={disabled}>
          <legend className="visually-hidden">Your sign-up details</legend>
          {formError && (
            <div className="notice notice-error" role="alert">
              {formError}
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
