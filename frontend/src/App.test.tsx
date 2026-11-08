import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { safeNextPath } from './auth/nextPath'
import { errorResponse, mockApi, renderApp, userResponse, type FakeRoutes } from './test/fakeAuth'

function renderAt(path: string, opts: { demoAllowed?: boolean; routes?: FakeRoutes } = {}) {
  const api = mockApi(opts.routes)
  return { ...renderApp(path, { demoAllowed: opts.demoAllowed ?? true }), ...api }
}

const heading = (name: string | RegExp) => screen.getByRole('heading', { level: 1, name })
const findHeading = (name: string | RegExp) => screen.findByRole('heading', { level: 1, name })

describe('public pages', () => {
  it('landing explains the app and links to sign up, sign in and privacy', () => {
    renderAt('/')
    expect(heading(/know where your money goes/i)).toBeInTheDocument()
    expect(screen.getByText(/does not connect to your bank/i)).toBeInTheDocument()
    expect(screen.getByText(/pounds sterling \(GBP\) only/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /create a free account/i })).toHaveAttribute('href', '/signup')
    expect(screen.getByRole('link', { name: /privacy notice/i })).toHaveAttribute('href', '/privacy')
  })

  it.each([
    ['/help', /help/i],
    ['/privacy', /privacy notice/i],
    ['/signup', /create your account/i],
    ['/login', 'Sign in'],
    ['/reset-password', /reset your password/i],
  ])('%s renders', (path, name) => {
    renderAt(path)
    expect(heading(name)).toBeInTheDocument()
  })

  it('password reset says it is not available yet', () => {
    renderAt('/reset-password')
    expect(screen.getByText(/password reset is not available yet/i)).toBeInTheDocument()
  })

  it('old /verify links go to sign in', async () => {
    renderAt('/verify?code=abc')
    expect(await findHeading('Sign in')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/login$/)
  })

  it('unknown routes show a not-found page', () => {
    renderAt('/does-not-exist')
    expect(heading(/page not found/i)).toBeInTheDocument()
  })

  it('does not expose P2 pages in the MVP', () => {
    renderAt('/goals')
    expect(heading(/page not found/i)).toBeInTheDocument()
  })
})

describe('protected routes', () => {
  it.each(['/dashboard', '/transactions', '/transactions/new', '/budgets', '/settings', '/more'])(
    'signed-out visit to %s redirects to sign in',
    async (path) => {
      renderAt(path)
      expect(await findHeading('Sign in')).toBeInTheDocument()
      expect(screen.getByTestId('location')).toHaveTextContent(`/login?next=${encodeURIComponent(path)}`)
    },
  )

  it('says it is checking while the session check is still running', () => {
    renderAt('/dashboard', { routes: { 'GET /api/auth/me': () => new Promise<Response>(() => undefined) } })
    expect(screen.getByRole('status')).toHaveTextContent('Checking you are signed in…')
    expect(screen.queryByRole('heading', { level: 1, name: 'Dashboard' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('a signed-in person sees the private page', async () => {
    renderAt('/dashboard', { routes: { 'GET /api/auth/me': userResponse } })
    expect(await findHeading('Dashboard')).toBeInTheDocument()
  })

  it('shows a safe setup message when the server is not configured (503)', async () => {
    renderAt('/dashboard', {
      routes: { 'GET /api/auth/me': () => errorResponse(503, 'service_unavailable', 'secret detail') },
    })
    expect(await findHeading(/not set up yet/i)).toBeInTheDocument()
    expect(screen.getByText(/backend server isn.t running or isn.t configured/i)).toBeInTheDocument()
    expect(screen.queryByText(/secret detail/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\.env\.local/)).not.toBeInTheDocument()
  })

  it('shows the setup message when the server cannot be reached', async () => {
    const api = mockApi()
    api.fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')))
    renderApp('/dashboard')
    expect(await findHeading(/not set up yet/i)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/could not be reached/i)
  })

  it('development preview returns to the requested page, then sign out locks it again', async () => {
    const user = userEvent.setup()
    const { queryClient, callsTo } = renderAt('/budgets')
    queryClient.setQueryData(['private'], { secret: true })

    await user.click(await screen.findByRole('button', { name: /preview the app layout/i }))
    expect(heading('Budgets')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(/not a real account/i)

    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0]
    for (const label of ['Dashboard', 'Transactions', 'Budgets', 'More']) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument()
    }
    expect(within(nav).getByRole('link', { name: 'Budgets' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Add entry' })).toHaveAttribute('href', '/transactions/new')

    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(heading(/know where your money goes/i)).toBeInTheDocument()
    expect(queryClient.getQueryData(['private'])).toBeUndefined()
    // A demo session has nothing on the server to end.
    expect(callsTo('POST /api/auth/logout')).toHaveLength(0)
  })

  it('hides the preview button when demo mode is off', async () => {
    renderAt('/login', { demoAllowed: false })
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /preview/i })).not.toBeInTheDocument()
  })
})

describe('safeNextPath', () => {
  it.each([
    [null, '/dashboard'],
    ['/budgets?month=2026-11', '/budgets?month=2026-11'],
    ['https://evil.example', '/dashboard'],
    ['//evil.example', '/dashboard'],
    ['/\\evil.example', '/dashboard'],
  ])('%s → %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected)
  })
})
