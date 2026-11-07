import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RATE_LIMIT_MESSAGE } from '../auth/authErrors'
import { createFakeAuth, fakeSession, jsonResponse, renderApp } from '../test/fakeAuth'

const EMAIL = 'sam@example.com'

const initialiseOk = {
  data: {
    created: true,
    profile: { id: 'user-1', locale: 'en-GB', currency: 'GBP', timezone: 'Europe/London', onboarding_completed_at: null },
    categories: [{ id: 'c1', name: 'Groceries', category_type: 'expense', archived_at: null }],
  },
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const h1 = (name: string | RegExp) => screen.findByRole('heading', { level: 1, name })

describe('verify page', () => {
  it('after sign-up, shows the email and resends with a cooldown', async () => {
    const user = userEvent.setup()
    const auth = createFakeAuth()
    renderApp({ pathname: '/verify', state: { email: EMAIL, justSignedUp: true } }, { client: auth.client })

    expect(await h1('Check your email')).toBeInTheDocument()
    expect(screen.getByText(EMAIL)).toBeInTheDocument()
    expect(screen.getByText(/spam or junk/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Resend email' }))
    expect(auth.fake.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: EMAIL,
      options: { emailRedirectTo: `${window.location.origin}/verify` },
    })
    expect(await screen.findByText(/we've sent a new link/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /resend email \(wait \d+s\)/i })).toBeDisabled()
  })

  it('explains the resend rate limit in plain English', async () => {
    const user = userEvent.setup()
    const auth = createFakeAuth()
    auth.fake.resend.mockResolvedValueOnce({
      data: null,
      error: { name: 'AuthApiError', code: 'over_email_send_rate_limit', status: 429, message: 'raw' },
    })
    renderApp({ pathname: '/verify', state: { email: EMAIL, justSignedUp: true } }, { client: auth.client })

    await user.click(await screen.findByRole('button', { name: 'Resend email' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(RATE_LIMIT_MESSAGE)
  })

  it.each([
    '/verify?error=access_denied&error_code=otp_expired&error_description=%3Cb%3EEmail+link+is+invalid%3C%2Fb%3E',
    '/verify#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid',
  ])('shows the expired-link state for %s without echoing the error text', async (path) => {
    const user = userEvent.setup()
    const auth = createFakeAuth()
    renderApp(path, { client: auth.client })

    expect(await h1('This link has expired or was already used')).toBeInTheDocument()
    expect(screen.queryByText(/email link is invalid/i)).not.toBeInTheDocument()
    expect(document.querySelector('b')).toBeNull()

    await user.type(screen.getByLabelText('Email address'), EMAIL)
    await user.click(screen.getByRole('button', { name: 'Resend email' }))
    expect(auth.fake.resend).toHaveBeenCalledWith(expect.objectContaining({ type: 'signup', email: EMAIL }))
    expect(await screen.findByText(/if that email address is waiting to be verified/i)).toBeInTheDocument()
    expect(screen.getByText(/already verified/i).querySelector('a')).toHaveAttribute('href', '/login')
  })

  it('shows the expired-link state when a ?code= link could not be used', async () => {
    const auth = createFakeAuth({ session: null })
    renderApp('/verify?code=abc', { client: auth.client })
    expect(await h1('This link has expired or was already used')).toBeInTheDocument()
  })

  it('with no details, shows general instructions and a resend form', async () => {
    const user = userEvent.setup()
    const auth = createFakeAuth()
    renderApp('/verify', { client: auth.client })

    expect(await h1('Check your email')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Resend email' }))
    expect(await screen.findByText('Enter your email address')).toBeInTheDocument()
    expect(auth.fake.resend).not.toHaveBeenCalled()
  })

  it('a verified session sets up the account exactly once, then opens the dashboard', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, initialiseOk))
    const auth = createFakeAuth({ session: fakeSession({ email: EMAIL, verified: true }) })
    const { queryClient } = renderApp('/verify?code=abc', { client: auth.client, strict: true })

    expect(await h1('Dashboard')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/dashboard$/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/account/initialise')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer fake-access-token')
    expect(queryClient.getQueryData(['account'])).toEqual(initialiseOk.data)
  })

  it('sets up the account when the session arrives after the link is exchanged', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, initialiseOk))
    const auth = createFakeAuth({ session: 'pending' })
    renderApp('/verify?code=abc', { client: auth.client })

    expect(await screen.findByText('Checking your link…')).toBeInTheDocument()
    act(() => auth.emit('SIGNED_IN', fakeSession({ email: EMAIL, verified: true })))

    expect(await h1('Dashboard')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows a retry button when setting up fails, and retrying works', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(503, { error: { code: 'service_unavailable', message: 'Down', request_id: 'req-123' } }),
      )
      .mockResolvedValueOnce(jsonResponse(200, initialiseOk))
    const auth = createFakeAuth({ session: fakeSession({ email: EMAIL, verified: true }) })
    renderApp('/verify', { client: auth.client })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't finish setting up your account. Please try again.")
    expect(alert).toHaveTextContent('req-123')

    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await h1('Dashboard')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('shows a friendly message when the network is down', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const auth = createFakeAuth({ session: fakeSession({ email: EMAIL, verified: true }) })
    renderApp('/verify', { client: auth.client })

    expect(await screen.findByRole('alert')).toHaveTextContent(/check your internet connection/i)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('route guard with real sessions', () => {
  it('shows a loading message while the saved session is being checked', async () => {
    const auth = createFakeAuth({ session: 'pending' })
    renderApp('/dashboard', { client: auth.client })

    expect(screen.getByRole('status')).toHaveTextContent('Checking you are signed in…')
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('sends an unverified account from /dashboard to /verify with no finance navigation', async () => {
    const auth = createFakeAuth({ session: fakeSession({ email: EMAIL, verified: false }) })
    renderApp('/dashboard', { client: auth.client })

    expect(await h1('Check your email')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/verify$/)
    expect(screen.getByText(EMAIL)).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Budgets' })).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a verified session can open private pages, and signing out calls Supabase', async () => {
    const user = userEvent.setup()
    const auth = createFakeAuth({ session: fakeSession({ email: EMAIL, verified: true }) })
    const { queryClient } = renderApp('/more', { client: auth.client })
    queryClient.setQueryData(['private'], { secret: true })

    expect(await h1('More')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Sign out' })[0])

    expect(await h1(/know where your money goes/i)).toBeInTheDocument()
    expect(auth.fake.signOut).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryData(['private'])).toBeUndefined()
  })

  it('unsubscribes from Supabase auth events on unmount', async () => {
    const auth = createFakeAuth()
    const { unmount } = renderApp('/', { client: auth.client })
    await h1(/know where your money goes/i)
    const sub = auth.fake.onAuthStateChange.mock.results[0].value.data.subscription
    unmount()
    expect(sub.unsubscribe).toHaveBeenCalled()
  })
})
