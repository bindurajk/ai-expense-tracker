import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { safeNextPath } from './auth/nextPath'
import { readConfig, type AppConfig } from './config'
import { AppRoutes } from './routes'

// Fake, non-secret values used only by tests.
const okConfig: AppConfig = { ok: true, supabaseUrl: 'https://example.test', supabaseAnonKey: 'test-key' }
const missingConfig: AppConfig = { ok: false, problems: ['VITE_SUPABASE_URL is not set.'] }

function renderAt(path: string, opts: { config?: AppConfig; demoAllowed?: boolean } = {}) {
  const queryClient = new QueryClient()
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider config={opts.config ?? okConfig} demoAllowed={opts.demoAllowed ?? true}>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  )
  return { queryClient }
}

const heading = (name: string | RegExp) => screen.getByRole('heading', { level: 1, name })

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
    ['/verify', /check your email/i],
    ['/reset-password', /reset your password/i],
  ])('%s renders', (path, name) => {
    renderAt(path)
    expect(heading(name)).toBeInTheDocument()
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
    (path) => {
      renderAt(path)
      expect(heading('Sign in')).toBeInTheDocument()
    },
  )

  it('missing settings show a safe setup message instead of crashing', () => {
    renderAt('/dashboard', { config: missingConfig })
    expect(heading(/not set up yet/i)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('VITE_SUPABASE_URL is not set.')
  })

  it('development preview returns to the requested page, then sign out locks it again', async () => {
    const user = userEvent.setup()
    const { queryClient } = renderAt('/budgets')
    queryClient.setQueryData(['private'], { secret: true })

    await user.click(screen.getByRole('button', { name: /preview the app layout/i }))
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
  })

  it('hides the preview button when demo mode is off', () => {
    renderAt('/login', { demoAllowed: false })
    expect(screen.queryByRole('button', { name: /preview/i })).not.toBeInTheDocument()
  })
})

describe('readConfig', () => {
  it('reports missing and blank values without echoing them', () => {
    const result = readConfig({ VITE_SUPABASE_URL: '  ', VITE_SUPABASE_ANON_KEY: undefined })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems).toHaveLength(2)
  })

  it('rejects a URL that is not a web address', () => {
    const result = readConfig({ VITE_SUPABASE_URL: 'not-a-url', VITE_SUPABASE_ANON_KEY: 'abc' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems.join(' ')).not.toContain('abc')
  })

  it('accepts complete settings', () => {
    expect(readConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'abc' }).ok).toBe(true)
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
