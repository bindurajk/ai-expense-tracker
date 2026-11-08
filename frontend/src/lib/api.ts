// A problem reported by the SpendWise API (or by the network), in a shape the pages can show safely.
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId: string | undefined
  readonly fieldErrors: Record<string, string> | undefined

  constructor(
    status: number,
    code: string,
    message: string,
    requestId?: string,
    fieldErrors?: Record<string, string>,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
    this.fieldErrors = fieldErrors
  }
}

export const NETWORK_ERROR_MESSAGE =
  "We couldn't reach SpendWise. Check your internet connection and try again."
const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.'

// The backend rejects state-changing requests without this header (a simple CSRF guard:
// other websites cannot add custom headers to requests they trigger).
export const CSRF_HEADER = 'X-Requested-With'
export const CSRF_HEADER_VALUE = 'SpendWise'
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS']

type ApiInit = Omit<RequestInit, 'body'> & {
  /** Sent as JSON. */
  body?: unknown
}

type ErrorBody = {
  error?: { code?: unknown; message?: unknown; request_id?: unknown; field_errors?: unknown }
}

function readFieldErrors(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value.trim()) result[key] = value
  }
  return Object.keys(result).length > 0 ? result : undefined
}

// Calls the SpendWise API. The session lives in an HttpOnly cookie set by the backend,
// which the browser sends automatically on same-origin requests; the app never sees a token.
export async function apiFetch<T>(path: string, init: ApiInit = {}): Promise<T> {
  const { body, headers, ...rest } = init
  const method = (rest.method ?? 'GET').toUpperCase()

  const requestHeaders = new Headers(headers)
  requestHeaders.set('Accept', 'application/json')
  if (body !== undefined) requestHeaders.set('Content-Type', 'application/json')
  if (!SAFE_METHODS.includes(method)) requestHeaders.set(CSRF_HEADER, CSRF_HEADER_VALUE)

  let response: Response
  try {
    response = await fetch(path, {
      ...rest,
      method,
      credentials: 'same-origin',
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
      readFieldErrors(err?.field_errors),
    )
  }

  return parsed as T
}
