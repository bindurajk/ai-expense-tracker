import { ApiError, apiFetch } from './api'
import type { AuthClient } from './supabase'

const auth = {
  getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: 'tok' } }, error: null })),
} as unknown as Pick<AuthClient, 'getSession'>

afterEach(() => vi.unstubAllGlobals())

describe('apiFetch', () => {
  it('sends JSON with the bearer token and returns the parsed body', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{"data":{"ok":true}}', { status: 200 })))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiFetch('/api/x', { method: 'POST', body: { a: 1 }, auth })).resolves.toEqual({ data: { ok: true } })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer tok')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(init.body).toBe('{"a":1}')
  })

  it('turns an error body into an ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response('{"error":{"code":"email_not_verified","message":"Verify first","request_id":"r1"}}', {
            status: 403,
          }),
        ),
      ),
    )
    const error = await apiFetch('/api/x', { auth }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 403, code: 'email_not_verified', message: 'Verify first', requestId: 'r1' })
  })

  it('reports network failures with a friendly message', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    const error = await apiFetch('/api/x', { auth }).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 0, code: 'network_error' })
    expect((error as ApiError).message).toMatch(/check your internet connection/i)
  })

  it('handles an error response that is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('<html>Bad gateway</html>', { status: 502 }))))
    const error = await apiFetch('/api/x', { auth }).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 502, code: 'http_error', message: 'Something went wrong. Please try again.' })
  })
})
