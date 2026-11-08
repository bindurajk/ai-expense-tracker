import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter, type InitialEntry } from 'react-router-dom'
import { vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { AppRoutes } from '../routes'
import { LocationProbe } from './LocationProbe'

// Test-only helpers: a fake SpendWise API (global fetch replaced, no network) and a render helper.

export const TEST_USER = { id: 'user-1', email: 'sam@example.com' }

export function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function errorResponse(status: number, code: string, message = 'Server message', extra: object = {}) {
  return jsonResponse(status, { error: { code, message, request_id: 'req-1', ...extra } })
}

export const userResponse = (user = TEST_USER, status = 200) => jsonResponse(status, { data: { user } })
export const signedOut = () => errorResponse(401, 'invalid_session', 'Please sign in.')

type Reply = Response | Promise<Response> | (() => Response | Promise<Response>)

/** Routes like 'GET /api/auth/me' → a reply. Unknown routes answer 404. */
export type FakeRoutes = Record<string, Reply>

export function mockApi(routes: FakeRoutes = {}) {
  const table: FakeRoutes = { 'GET /api/auth/me': signedOut, 'POST /api/auth/logout': () => new Response(null, { status: 204 }), ...routes }
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url
    const key = `${(init?.method ?? 'GET').toUpperCase()} ${url}`
    const reply = table[key]
    if (reply === undefined) return Promise.resolve(errorResponse(404, 'not_found', 'Not found'))
    const result = typeof reply === 'function' ? reply() : reply
    // A Response body can only be read once, so always hand out a copy.
    return Promise.resolve(result).then((r) => r.clone())
  })
  vi.stubGlobal('fetch', fetchMock)

  /** Every call made to a route, as [path, init]. */
  const callsTo = (key: string) =>
    fetchMock.mock.calls.filter(([input, init]) => `${(init?.method ?? 'GET').toUpperCase()} ${String(input)}` === key)

  return { fetchMock, callsTo }
}

/** Parses the JSON body a request was sent with. */
export function sentBody(call: unknown[]) {
  const init = call[1] as RequestInit | undefined
  return JSON.parse(String(init?.body ?? 'null')) as unknown
}

export function renderApp(entry: InitialEntry, { strict = false, demoAllowed = false } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const tree = (
    <QueryClientProvider client={queryClient}>
      <AuthProvider demoAllowed={demoAllowed}>
        <MemoryRouter initialEntries={[entry]}>
          <AppRoutes />
          <LocationProbe />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
  return { queryClient, ...render(strict ? <StrictMode>{tree}</StrictMode> : tree) }
}
