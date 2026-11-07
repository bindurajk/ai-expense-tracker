import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RATE_LIMIT_MESSAGE } from '../auth/authErrors'
import { createFakeAuth, renderApp } from '../test/fakeAuth'

const EMAIL = 'sam@example.com'

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
  it('shows field errors, focuses the first one and does not call Supabase', async () => {
    const user = userEvent.setup()
    const auth = createFakeAuth()
    renderApp('/signup', { client: auth.client })

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
    expect(auth.fake.signUp).not.toHaveBeenCalled()
  })

  it('sends the sign-up and shows "Check your email" without putting the email in the address', async () => {
    const user = userEvent.setup()
    const auth = createFakeAuth()
    renderApp('/signup', { client: auth.client })

    await fillForm(user, { email: `  ${EMAIL}  ` })
    await user.click(submitButton())

    expect(await screen.findByRole('heading', { level: 1, name: 'Check your email' })).toBeInTheDocument()
    expect(screen.getByText(EMAIL)).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/verify$/)
    expect(screen.getByTestId('location').textContent).not.toContain('example.com')
    expect(auth.fake.signUp).toHaveBeenCalledTimes(1)
    expect(auth.fake.signUp).toHaveBeenCalledWith({
      email: EMAIL,
      password: 'correct-horse',
      options: { emailRedirectTo: `${window.location.origin}/verify` },
    })
  })

  it('shows the same message when the email may already have an account', async () => {
    const user = userEvent.setup()
    const auth = createFakeAuth()
    // Supabase's "already registered" answer: success, but a user with no identities.
    auth.fake.signUp.mockResolvedValueOnce({
      data: { user: { id: 'obfuscated', identities: [] }, session: null },
      error: null,
    })
    renderApp('/signup', { client: auth.client })

    await fillForm(user)
    await user.click(submitButton())

    expect(await screen.findByRole('heading', { level: 1, name: 'Check your email' })).toBeInTheDocument()
    expect(screen.getByText(EMAIL)).toBeInTheDocument()
    expect(screen.queryByText(/already (has an account|registered|exists)/i)).not.toBeInTheDocument()
  })

  it('explains rate limits in plain English and keeps what was typed', async () => {
    const user = userEvent.setup()
    const auth = createFakeAuth()
    auth.fake.signUp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { name: 'AuthApiError', code: 'over_email_send_rate_limit', status: 429, message: 'raw supabase text' },
    })
    renderApp('/signup', { client: auth.client })

    await fillForm(user)
    await user.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(RATE_LIMIT_MESSAGE)
    expect(screen.queryByText(/raw supabase text/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Email address')).toHaveValue(EMAIL)
    expect(screen.getByRole('heading', { level: 1, name: 'Create your account' })).toBeInTheDocument()
  })

  it('shows a weak password message on the password field', async () => {
    const user = userEvent.setup()
    const auth = createFakeAuth()
    auth.fake.signUp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { name: 'AuthWeakPasswordError', code: 'weak_password', status: 422, message: 'Password is too common.' },
    })
    renderApp('/signup', { client: auth.client })

    await fillForm(user)
    await user.click(submitButton())

    expect(await screen.findByText('Password is too common.')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Password')).toHaveFocus()
  })

  it('shows a generic message for unexpected errors', async () => {
    const user = userEvent.setup()
    const auth = createFakeAuth()
    auth.fake.signUp.mockRejectedValueOnce(new Error('boom'))
    renderApp('/signup', { client: auth.client })

    await fillForm(user)
    await user.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
    expect(screen.queryByText('boom')).not.toBeInTheDocument()
  })

  it('submits only once when the button is double-clicked', async () => {
    const user = userEvent.setup()
    const auth = createFakeAuth()
    let finish: (v: { data: unknown; error: unknown }) => void = () => undefined
    auth.fake.signUp.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    renderApp('/signup', { client: auth.client })

    await fillForm(user)
    await user.dblClick(submitButton())
    await user.click(submitButton())

    expect(await screen.findByRole('button', { name: 'Creating your account…' })).toBeDisabled()
    expect(auth.fake.signUp).toHaveBeenCalledTimes(1)

    finish({ data: { user: { identities: [{}] }, session: null }, error: null })
    expect(await screen.findByRole('heading', { level: 1, name: 'Check your email' })).toBeInTheDocument()
    expect(auth.fake.signUp).toHaveBeenCalledTimes(1)
  })

  it('disables the form when the app is not set up', () => {
    renderApp('/signup', { client: null, config: { ok: false, problems: ['VITE_SUPABASE_URL is not set.'] } })
    expect(screen.getByText(/sign-up is not available yet/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Email address')).toBeDisabled()
    expect(screen.getByText(/already have an account/i).querySelector('a')).toHaveAttribute('href', '/login')
  })
})
