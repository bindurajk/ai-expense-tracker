import { getSupabase, type AuthClient } from './supabase'

// A problem reported by the SpendWise API (or by the network), in a shape the pages can show safely.
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId: string | undefined

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

export const NETWORK_ERROR_MESSAGE =
  "We couldn't reach SpendWise. Check your internet connection and try again."
const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.'

type ApiInit = Omit<RequestInit, 'body'> & {
  /** Sent as JSON. */
  body?: unknown
  /** Which Supabase Auth client to read the session from. Defaults to the app's client. */
  auth?: Pick<AuthClient, 'getSession'> | null
}

type ErrorBody = { error?: { code?: unknown; message?: unknown; request_id?: unknown } }

// Calls the SpendWise API with the signed-in person's Supabase access token.
// The token is only ever placed in the Authorization header — never logged or put in a URL.
export async function apiFetch<T>(path: string, init: ApiInit = {}): Promise<T> {
  const { body, auth = getSupabase()?.auth ?? null, headers, ...rest } = init

  const requestHeaders = new Headers(headers)
  requestHeaders.set('Accept', 'application/json')
  if (body !== undefined) requestHeaders.set('Content-Type', 'application/json')

  if (auth) {
    const { data } = await auth.getSession()
    const token = data.session?.access_token
    if (token) requestHeaders.set('Authorization', `Bearer ${token}`)
  }

  let response: Response
  try {
    response = await fetch(path, {
      ...rest,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'network_error', NETWORK_ERROR_MESSAGE)
  }

  let parsed: unknown = null
  try {
    const text = await response.text()
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }

  if (!response.ok) {
    const err = (parsed as ErrorBody | null)?.error
    throw new ApiError(
      response.status,
      typeof err?.code === 'string' ? err.code : 'http_error',
      typeof err?.message === 'string' ? err.message : GENERIC_ERROR_MESSAGE,
      typeof err?.request_id === 'string' ? err.request_id : undefined,
    )
  }

  return parsed as T
}
