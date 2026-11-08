import { ApiError, apiFetch } from './api'

type Call = [string, RequestInit]

function stubFetch(response: () => Promise<Response>) {
  const fetchMock = vi.fn(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('apiFetch', () => {
  it('sends JSON with the CSRF header and no Authorization header', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response('{"data":{"ok":true}}', { status: 200 })))

    await expect(apiFetch('/api/x', { method: 'POST', body: { a: 1 } })).resolves.toEqual({ data: { ok: true } })
    const [, init] = fetchMock.mock.calls[0] as unknown as Call
    const headers = new Headers(init.headers)
    expect(headers.get('X-Requested-With')).toBe('SpendWise')
    expect(headers.get('Authorization')).toBeNull()
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(init.credentials).toBe('same-origin')
    expect(init.body).toBe('{"a":1}')
  })

  it.each(['PUT', 'PATCH', 'DELETE', 'post'])('adds the CSRF header to %s requests', async (method) => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response(null, { status: 204 })))
    await apiFetch('/api/x', { method })
    const [, init] = fetchMock.mock.calls[0] as unknown as Call
    expect(new Headers(init.headers).get('X-Requested-With')).toBe('SpendWise')
  })

  it('leaves the CSRF header off GET requests', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response('{}', { status: 200 })))
    await apiFetch('/api/x')
    const [, init] = fetchMock.mock.calls[0] as unknown as Call
    expect(new Headers(init.headers).get('X-Requested-With')).toBeNull()
  })

  it('turns an error body into an ApiError, including field errors', async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response(
          '{"error":{"code":"validation_failed","message":"Check the form","request_id":"r1","field_errors":{"email":"Bad email","x":3}}}',
          { status: 422 },
        ),
      ),
    )
    const error = await apiFetch('/api/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 422,
      code: 'validation_failed',
      message: 'Check the form',
      requestId: 'r1',
      fieldErrors: { email: 'Bad email' },
    })
  })

  it('reports network failures with a friendly message', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')))
    const error = await apiFetch('/api/x').catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 0, code: 'network_error' })
    expect((error as ApiError).message).toMatch(/check your internet connection/i)
  })

  it('handles an error response that is not JSON', async () => {
    stubFetch(() => Promise.resolve(new Response('<html>Bad gateway</html>', { status: 502 })))
    const error = await apiFetch('/api/x').catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 502, code: 'http_error', message: 'Something went wrong. Please try again.' })
  })
})
