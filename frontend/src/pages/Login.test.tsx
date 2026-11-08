import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { INVALID_CREDENTIALS_MESSAGE } from '../auth/authErrors'
import { errorResponse, mockApi, renderApp, sentBody, TEST_USER, userResponse } from '../test/fakeAuth'

const LOGIN = 'POST /api/auth/login'
const EMAIL = TEST_USER.email

async function signIn(user: ReturnType<typeof userEvent.setup>, password = 'correct-horse') {
  await user.type(await screen.findByLabelText('Email address'), EMAIL)
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('sign-in page', () => {
  it('signs in and returns to the page in "next"', async () => {
    const user = userEvent.setup()
    const api = mockApi({ [LOGIN]: userResponse })
    renderApp('/login?next=%2Fbudgets%3Fmonth%3D2026-11')

    await signIn(user)

    expect(await screen.findByRole('heading', { level: 1, name: 'Budgets' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/budgets\?month=2026-11$/)
    expect(sentBody(api.callsTo(LOGIN)[0])).toEqual({ email: EMAIL, password: 'correct-horse' })
  })

  it('ignores a "next" that points at another website', async () => {
    const user = userEvent.setup()
    mockApi({ [LOGIN]: userResponse })
    renderApp('/login?next=%2F%2Fevil.example')

    await signIn(user)

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  })

  it('shows one generic message for a wrong email or password and keeps the email', async () => {
    const user = userEvent.setup()
    mockApi({ [LOGIN]: () => errorResponse(401, 'invalid_credentials', INVALID_CREDENTIALS_MESSAGE) })
    renderApp('/login')

    await signIn(user, 'wrong-password')

    expect(await screen.findByRole('alert')).toHaveTextContent(INVALID_CREDENTIALS_MESSAGE)
    expect(screen.getByLabelText('Email address')).toHaveValue(EMAIL)
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
  })

  it('checks the form before sending anything', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    renderApp('/login')

    await user.click(await screen.findByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Enter your email address')).toBeInTheDocument()
    expect(screen.getByText('Enter your password')).toBeInTheDocument()
    expect(screen.getByLabelText('Email address')).toHaveFocus()
    expect(api.callsTo(LOGIN)).toHaveLength(0)
  })

  it('links to sign-up and password reset', async () => {
    mockApi()
    renderApp('/login')
    expect(await screen.findByRole('link', { name: 'Forgot your password?' })).toHaveAttribute('href', '/reset-password')
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/signup')
  })

  it('sends someone who is already signed in to the dashboard', async () => {
    mockApi({ 'GET /api/auth/me': userResponse })
    renderApp('/login')
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  })
})

describe('signing out', () => {
  it.each([
    ['the header button', '/dashboard'],
    ['the More page', '/more'],
  ])('from %s ends the server session and returns home', async (_where, path) => {
    const user = userEvent.setup()
    const api = mockApi({ 'GET /api/auth/me': userResponse })
    const { queryClient } = renderApp(path)
    await screen.findByRole('heading', { level: 1, name: /dashboard|more/i })
    queryClient.setQueryData(['private'], { secret: true })

    const buttons = screen.getAllByRole('button', { name: 'Sign out' })
    await user.click(buttons[buttons.length - 1])

    expect(await screen.findByRole('heading', { level: 1, name: /know where your money goes/i })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
    expect(api.callsTo('POST /api/auth/logout')).toHaveLength(1)
    expect(queryClient.getQueryData(['private'])).toBeUndefined()
  })

  it('still signs out locally when the server call fails', async () => {
    const user = userEvent.setup()
    mockApi({
      'GET /api/auth/me': userResponse,
      'POST /api/auth/logout': () => errorResponse(500, 'internal_error'),
    })
    renderApp('/dashboard')
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('heading', { level: 1, name: /know where your money goes/i })).toBeInTheDocument()
  })
})
