import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ACCOUNT_EXISTS_MESSAGE, NETWORK_MESSAGE, RATE_LIMIT_MESSAGE } from '../auth/authErrors'
import { errorResponse, mockApi, renderApp, sentBody, TEST_USER, userResponse } from '../test/fakeAuth'

const EMAIL = TEST_USER.email
const SIGNUP = 'POST /api/auth/signup'

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  { email = EMAIL, password = 'correct-horse', confirm = undefined as string | undefined } = {},
) {
  await user.type(screen.getByLabelText('Email address'), email)
  await user.type(screen.getByLabelText('Password'), password)
  await user.type(screen.getByLabelText('Confirm password'), confirm ?? password)
}

const submitButton = () => screen.getByRole('button', { name: /create account|creating your account/i })

describe('sign-up page', () => {
  it('shows field errors, focuses the first one and sends nothing', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    renderApp('/signup')

    await fillForm(user, { email: 'not-an-email', password: 'short', confirm: 'different' })
    await user.click(submitButton())

    const email = screen.getByLabelText('Email address')
    expect(await screen.findByText('Enter a valid email address, like name@gmail.com')).toBeInTheDocument()
    expect(screen.getByText('Your password must be at least 8 characters')).toBeInTheDocument()
    expect(screen.getByText('The passwords do not match')).toBeInTheDocument()
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email).toHaveAttribute('aria-describedby', 'signup-email-error')
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      'At least 8 characters. Your password must be at least 8 characters',
    )
    expect(email).toHaveFocus()
    expect(api.callsTo(SIGNUP)).toHaveLength(0)
  })

  it('rejects passwords longer than 128 characters', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    renderApp('/signup')

    await fillForm(user, { password: 'a'.repeat(129) })
    await user.click(submitButton())

    expect(await screen.findByText('Your password can be at most 128 characters')).toBeInTheDocument()
    expect(api.callsTo(SIGNUP)).toHaveLength(0)
  })

  it('creates the account and lands on the dashboard, signed in', async () => {
    const user = userEvent.setup()
    const api = mockApi({ [SIGNUP]: () => userResponse(TEST_USER, 201) })
    renderApp('/signup')

    await fillForm(user, { email: `  ${EMAIL}  ` })
    await user.click(submitButton())

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/dashboard$/)
    const calls = api.callsTo(SIGNUP)
    expect(calls).toHaveLength(1)
    expect(sentBody(calls[0])).toEqual({ email: EMAIL, password: 'correct-horse' })
    // The confirmation copy never leaves the browser.
    expect(JSON.stringify(sentBody(calls[0]))).not.toContain('confirm')
  })

  it('explains an existing account, links to sign in and keeps the email', async () => {
    const user = userEvent.setup()
    mockApi({ [SIGNUP]: () => errorResponse(409, 'account_exists', ACCOUNT_EXISTS_MESSAGE) })
    renderApp('/signup')

    await fillForm(user)
    await user.click(submitButton())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(ACCOUNT_EXISTS_MESSAGE)
    expect(alert.querySelector('a')).toHaveAttribute('href', '/login')
    expect(screen.getByLabelText('Email address')).toHaveValue(EMAIL)
  })

  it('puts server field errors on the right fields and focuses the first one', async () => {
    const user = userEvent.setup()
    mockApi({
      [SIGNUP]: () =>
        errorResponse(422, 'validation_failed', 'Check the form', {
          field_errors: { password: 'Choose a less common password.' },
        }),
    })
    renderApp('/signup')

    await fillForm(user)
    await user.click(submitButton())

    expect(await screen.findByText('Choose a less common password.')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Password')).toHaveFocus()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each([
    [() => errorResponse(429, 'rate_limited', 'raw server text'), RATE_LIMIT_MESSAGE],
    [() => errorResponse(503, 'service_unavailable', 'raw server text'), /isn't available right now/],
    [() => Promise.reject(new TypeError('Failed to fetch')), NETWORK_MESSAGE],
    [() => errorResponse(500, 'internal_error', 'raw server text'), 'Something went wrong. Please try again.'],
  ])('shows a plain message for other problems and keeps what was typed (%#)', async (reply, message) => {
    const user = userEvent.setup()
    mockApi({ [SIGNUP]: reply })
    renderApp('/signup')

    await fillForm(user)
    await user.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.queryByText(/raw server text/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Email address')).toHaveValue(EMAIL)
    expect(screen.getByRole('heading', { level: 1, name: 'Create your account' })).toBeInTheDocument()
  })

  it('submits only once when the button is double-clicked', async () => {
    const user = userEvent.setup()
    let finish: (r: Response) => void = () => undefined
    const pending = new Promise<Response>((resolve) => (finish = resolve))
    const api = mockApi({ [SIGNUP]: () => pending })
    renderApp('/signup')

    await fillForm(user)
    await user.dblClick(submitButton())
    await user.click(submitButton())

    expect(await screen.findByRole('button', { name: 'Creating your account…' })).toBeDisabled()
    expect(api.callsTo(SIGNUP)).toHaveLength(1)

    finish(userResponse(TEST_USER, 201))
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(api.callsTo(SIGNUP)).toHaveLength(1)
  })

  it('sends someone who is already signed in to the dashboard', async () => {
    mockApi({ 'GET /api/auth/me': userResponse })
    renderApp('/signup')
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  })
})
