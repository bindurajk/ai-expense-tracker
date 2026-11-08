import { z } from 'zod'

// Plain-English messages for sign-up and sign-in problems reported by the SpendWise API.
// We never show raw error objects or server stack traces.

export const RATE_LIMIT_MESSAGE = 'Too many attempts. Please wait a few minutes and try again.'
export const INVALID_EMAIL_MESSAGE = 'Enter a valid email address, like name@gmail.com'
export const GENERIC_MESSAGE = 'Something went wrong. Please try again.'
export const NETWORK_MESSAGE = "We couldn't connect. Check your internet connection and try again."
export const ACCOUNT_EXISTS_MESSAGE = 'An account with this email already exists. Try signing in.'
// Never say whether it was the email or the password that was wrong.
export const INVALID_CREDENTIALS_MESSAGE = 'Email or password is incorrect.'
export const SERVICE_UNAVAILABLE_MESSAGE =
  "SpendWise isn't available right now. Please try again in a few minutes."

type ApiErrorLike = { code?: string; status?: number; fieldErrors?: Record<string, string> }

export type AuthErrorKind = 'rate_limited' | 'network_error' | 'account_exists' | 'invalid_credentials' | 'service_unavailable' | 'generic'

export type MappedAuthError = { kind: AuthErrorKind; message: string }

// Turns an API problem into a safe, friendly form-level message.
export function mapAuthError(error: ApiErrorLike | null | undefined): MappedAuthError {
  const code = error?.code
  const status = error?.status
  if (code === 'rate_limited' || status === 429) return { kind: 'rate_limited', message: RATE_LIMIT_MESSAGE }
  if (code === 'network_error' || status === 0) return { kind: 'network_error', message: NETWORK_MESSAGE }
  if (code === 'account_exists' || status === 409) return { kind: 'account_exists', message: ACCOUNT_EXISTS_MESSAGE }
  if (code === 'invalid_credentials' || status === 401) {
    return { kind: 'invalid_credentials', message: INVALID_CREDENTIALS_MESSAGE }
  }
  if (code === 'service_unavailable' || status === 503) {
    return { kind: 'service_unavailable', message: SERVICE_UNAVAILABLE_MESSAGE }
  }
  return { kind: 'generic', message: GENERIC_MESSAGE }
}

// Email rules shared by every form: trimmed, a real-looking address, at most 254 characters.
export const emailSchema = z
  .string()
  .trim()
  .min(1, { error: 'Enter your email address' })
  .max(254, { error: 'Email addresses can be at most 254 characters' })
  .pipe(z.email({ error: INVALID_EMAIL_MESSAGE }))
