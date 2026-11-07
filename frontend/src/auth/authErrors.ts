import { z } from 'zod'

// Plain-English messages for Supabase Auth problems. We never show raw error objects,
// and no message ever says whether an email address already has an account.

export const RATE_LIMIT_MESSAGE = 'Too many emails have been sent. Please wait a few minutes and try again.'
export const INVALID_EMAIL_MESSAGE = 'Enter a valid email address, like name@gmail.com'
// Supabase accepted the format but could not email the address (for example a made-up
// domain, or one its free email sender is not allowed to send to).
export const UNDELIVERABLE_EMAIL_MESSAGE =
  "We couldn't send an email to that address. Use a real address you can open, then try again."
export const GENERIC_MESSAGE = 'Something went wrong. Please try again.'
export const NETWORK_MESSAGE = "We couldn't connect. Check your internet connection and try again."
const SIGNUP_DISABLED_MESSAGE = "New accounts can't be created right now. Please try again later."
const WEAK_PASSWORD_MESSAGE = 'Choose a stronger password.'

type AuthErrorLike = { code?: string; status?: number; message?: string; name?: string }

export type MappedAuthError = { field?: 'email' | 'password'; message: string }

export function mapAuthError(error: AuthErrorLike | null | undefined): MappedAuthError {
  const code = error?.code
  const status = error?.status
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || status === 429) {
    return { message: RATE_LIMIT_MESSAGE }
  }
  if (code === 'weak_password') {
    const text = typeof error?.message === 'string' && error.message.trim() ? error.message.trim() : ''
    return { field: 'password', message: text || WEAK_PASSWORD_MESSAGE }
  }
  if (code === 'email_address_invalid' || code === 'email_address_not_authorized') {
    return { field: 'email', message: UNDELIVERABLE_EMAIL_MESSAGE }
  }
  if (code === 'validation_failed') {
    return { field: 'email', message: INVALID_EMAIL_MESSAGE }
  }
  if (code === 'signup_disabled') {
    return { message: SIGNUP_DISABLED_MESSAGE }
  }
  if (error?.name === 'AuthRetryableFetchError' || status === 0) {
    return { message: NETWORK_MESSAGE }
  }
  return { message: GENERIC_MESSAGE }
}

// Email rules shared by every form: trimmed, a real-looking address, at most 254 characters.
export const emailSchema = z
  .string()
  .trim()
  .min(1, { error: 'Enter your email address' })
  .max(254, { error: 'Email addresses can be at most 254 characters' })
  .pipe(z.email({ error: INVALID_EMAIL_MESSAGE }))
