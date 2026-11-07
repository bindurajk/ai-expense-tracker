import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '../auth/AuthContext'
import { emailSchema, GENERIC_MESSAGE, mapAuthError } from '../auth/authErrors'
import { safeNextPath } from '../auth/nextPath'
import { Field } from '../components/Field'
import { ApiError, apiFetch } from '../lib/api'
import type { AuthClient } from '../lib/supabase'
import { usePageTitle } from '../usePageTitle'
import type { VerifyRouteState } from './Signup'

const RESEND_COOLDOWN_SECONDS = 60

export type InitialiseResponse = {
  data: {
    created: boolean
    profile: {
      id: string
      locale: string
      currency: string
      timezone: string
      onboarding_completed_at: string | null
    }
    categories: { id: string; name: string; category_type: string; archived_at: string | null }[]
  }
}

// Looks at the web address the email link opened. We only check which keys are present;
// Supabase's error text is never shown, so nothing from the link is rendered.
function readLink(search: string, hash: string) {
  const query = new URLSearchParams(search)
  const fragment = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  const has = (key: string) => query.has(key) || fragment.has(key)
  return {
    hasError: has('error') || has('error_code') || has('error_description'),
    hasToken: query.has('code') || fragment.has('access_token'),
  }
}

export function Verify() {
  usePageTitle('Verify your email')
  const { status, session } = useAuth()
  const location = useLocation()
  const routeState = (location.state ?? null) as VerifyRouteState | null
  const link = useMemo(() => readLink(location.search, location.hash), [location.search, location.hash])

  if (session?.kind === 'supabase' && session.emailVerified) return <SettingUp />
  if (link.hasError) return <LinkProblem />
  if (session?.kind === 'supabase') return <CheckEmail email={session.email} />
  if (link.hasToken) {
    if (status === 'loading') {
      return (
        <section className="page narrow">
          <h1>Verify your email</h1>
          <p role="status">Checking your link…</p>
        </section>
      )
    }
    return <LinkProblem />
  }
  if (routeState?.justSignedUp && routeState.email) return <CheckEmail email={routeState.email} />
  return <General />
}

// --- State: the person has a verified session, so finish setting up their account. ---

function initialiseErrorMessage(error: ApiError): string {
  if (error.code === 'network_error') return error.message
  if (error.status === 401 || error.code === 'invalid_session') {
    return 'Your sign-in has expired. Please sign in again.'
  }
  if (error.code === 'email_not_verified') {
    return "Your email address isn't verified yet. Open the link in the email we sent you."
  }
  return "We couldn't finish setting up your account. Please try again."
}

function SettingUp() {
  const { client } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const started = useRef(false)
  const [error, setError] = useState<ApiError | null>(null)

  const run = useCallback(async () => {
    setError(null)
    try {
      // Safe to repeat: the server creates the profile and starter categories only once.
      const result = await apiFetch<InitialiseResponse>('/api/account/initialise', {
        method: 'POST',
        auth: client,
      })
      queryClient.setQueryData(['account'], result?.data ?? null)
      navigate(safeNextPath(null), { replace: true })
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, 'unknown_error', GENERIC_MESSAGE))
    }
  }, [client, navigate, queryClient])

  useEffect(() => {
    // React's development double-run would otherwise call the server twice.
    if (started.current) return
    started.current = true
    void run()
  }, [run])

  return (
    <section className="page narrow">
      <h1>Your email is verified</h1>
      {error ? (
        <div className="notice notice-error" role="alert">
          <p>{initialiseErrorMessage(error)}</p>
          {error.requestId && <p className="muted">Reference: {error.requestId}</p>}
          <div className="actions">
            <button type="button" className="button button-primary" onClick={() => void run()}>
              Try again
            </button>
            <Link to="/login" className="button button-secondary">
              Go to sign in
            </Link>
          </div>
        </div>
      ) : (
        <p role="status">Setting up your account…</p>
      )}
    </section>
  )
}

// --- Resending the verification email ---

function useResend(client: AuthClient | null) {
  const [cooldown, setCooldown] = useState(0)
  const [sending, setSending] = useState(false)
  const inFlight = useRef(false)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  // Resolves to null when the email was sent, otherwise to a friendly problem.
  const send = useCallback(
    async (email: string) => {
      if (!client) return mapAuthError(null)
      if (inFlight.current) return null
      inFlight.current = true
      setSending(true)
      try {
        const { error } = await client.resend({
          type: 'signup',
          email,
          options: { emailRedirectTo: `${window.location.origin}/verify` },
        })
        if (error) return mapAuthError(error)
        setCooldown(RESEND_COOLDOWN_SECONDS)
        return null
      } catch {
        return mapAuthError(null)
      } finally {
        inFlight.current = false
        setSending(false)
      }
    },
    [client],
  )

  const label = sending ? 'Sending…' : cooldown > 0 ? `Resend email (wait ${cooldown}s)` : 'Resend email'
  return { send, label, disabled: !client || sending || cooldown > 0 }
}

function ResendButton({ email }: { email: string }) {
  const { client } = useAuth()
  const resend = useResend(client)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  async function onClick() {
    setResult(null)
    const problem = await resend.send(email)
    setResult(
      problem
        ? { ok: false, text: problem.message }
        : { ok: true, text: "We've sent a new link. It can take a few minutes to arrive." },
    )
  }

  return (
    <div className="resend">
      <button type="button" className="button button-secondary" disabled={resend.disabled} onClick={onClick}>
        {resend.label}
      </button>
      {result && !result.ok && (
        <p className="notice notice-error" role="alert">
          {result.text}
        </p>
      )}
      <p role="status">{result?.ok ? result.text : ''}</p>
    </div>
  )
}

const resendSchema = z.object({ email: emailSchema })
type ResendInput = z.input<typeof resendSchema>
type ResendValues = z.output<typeof resendSchema>

function ResendForm() {
  const { client } = useAuth()
  const resend = useResend(client)
  const [formError, setFormError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ResendInput, unknown, ResendValues>({
    resolver: zodResolver(resendSchema),
    defaultValues: { email: '' },
  })

  async function onSubmit(values: ResendValues) {
    setFormError(null)
    setSent(false)
    const problem = await resend.send(values.email)
    if (!problem) {
      setSent(true)
    } else if (problem.field === 'email') {
      setError('email', { type: 'server', message: problem.message }, { shouldFocus: true })
    } else {
      setFormError(problem.message)
    }
  }

  return (
    <form className="form" noValidate onSubmit={handleSubmit(onSubmit)} aria-labelledby="resend-heading">
      <h2 id="resend-heading">Send a new verification link</h2>
      {!client && (
        <p className="notice notice-warning" role="status">
          This is not available yet because the app is not fully set up.
        </p>
      )}
      {formError && (
        <div className="notice notice-error" role="alert">
          {formError}
        </div>
      )}
      <Field
        id="resend-email"
        label="Email address"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        registration={register('email')}
      />
      <button type="submit" className="button button-primary" disabled={resend.disabled}>
        {resend.label}
      </button>
      <p role="status">
        {sent
          ? "If that email address is waiting to be verified, we've sent a new link. It can take a few minutes to arrive."
          : ''}
      </p>
    </form>
  )
}

// --- Simple states ---

function CheckEmail({ email }: { email: string }) {
  return (
    <section className="page narrow">
      <h1>Check your email</h1>
      <p>
        We&apos;ve sent a link to <strong>{email}</strong>. Open the link on this device to finish
        creating your account.
      </p>
      <p>Can&apos;t find it? Check your spam or junk folder. It can take a few minutes to arrive.</p>
      <ResendButton email={email} />
      <p>
        Already verified? <Link to="/login">Sign in</Link>
      </p>
    </section>
  )
}

function LinkProblem() {
  return (
    <section className="page narrow">
      <h1>This link has expired or was already used</h1>
      <p>
        Verification links work once and only for a limited time. They also need to be opened on the
        same device and browser you used to sign up.
      </p>
      <p>Enter your email address and we&apos;ll send you a new link.</p>
      <ResendForm />
      <p>
        Already verified? <Link to="/login">Sign in</Link>
      </p>
    </section>
  )
}

function General() {
  return (
    <section className="page narrow">
      <h1>Check your email</h1>
      <p>
        To finish creating your account, open the verification link we emailed you. Open it on the
        same device you signed up on.
      </p>
      <p>Can&apos;t find it? Check your spam or junk folder, or ask for a new link below.</p>
      <ResendForm />
      <p>
        Already verified? <Link to="/login">Sign in</Link>
      </p>
    </section>
  )
}
