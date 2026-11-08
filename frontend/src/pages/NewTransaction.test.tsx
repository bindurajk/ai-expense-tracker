import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { todayInLondon } from '../lib/money'
import { errorResponse, jsonResponse, mockApi, renderApp, sentBody, TEST_USER, userResponse } from '../test/fakeAuth'

const ADD = 'POST /api/transactions'
const RECENT = 'GET /api/transactions/recent?limit=5'

const CATEGORIES = [
  { id: 'c-groc', name: 'Groceries', category_type: 'expense', archived_at: null },
  { id: 'c-trans', name: 'Transport', category_type: 'expense', archived_at: null },
  { id: 'c-old', name: 'Old stuff', category_type: 'expense', archived_at: '2026-01-01T00:00:00Z' },
  { id: 'c-sal', name: 'Salary', category_type: 'income', archived_at: null },
]

function saved(body: Record<string, unknown>, name: string) {
  return jsonResponse(201, {
    data: { id: 't-1', version: 1, category_name: name, ...body, note: body.note ?? null },
  })
}

function setup(routes = {}) {
  localStorage.clear()
  return mockApi({
    'GET /api/auth/me': userResponse,
    'GET /api/categories': jsonResponse(200, { data: CATEGORIES }),
    [RECENT]: jsonResponse(200, { data: [] }),
    ...routes,
  })
}

async function fill(user: ReturnType<typeof userEvent.setup>, amount: string, category = 'Groceries') {
  await user.type(await screen.findByLabelText('Amount (£)'), amount)
  await waitFor(() => expect(screen.getByRole('option', { name: category })).toBeInTheDocument())
  await user.selectOptions(screen.getByLabelText('Category'), category)
}

describe('add entry page', () => {
  it('saves an expense in whole pence with a retry-safe key, then gets ready for the next one', async () => {
    const user = userEvent.setup()
    const api = setup({
      [ADD]: () => saved({ transaction_type: 'expense', amount_pence: 1250, occurred_on: todayInLondon() }, 'Groceries'),
    })
    renderApp('/transactions/new')

    await fill(user, '12.50')
    await user.type(screen.getByLabelText('Note (optional)'), '  Weekly shop ')
    await user.click(screen.getByRole('button', { name: 'Save entry' }))

    expect(await screen.findByText(/Saved: £12\.50 expense in Groceries/)).toBeInTheDocument()
    const [call] = api.callsTo(ADD)
    expect(sentBody(call)).toEqual({
      transaction_type: 'expense',
      amount_pence: 1250,
      category_id: 'c-groc',
      occurred_on: todayInLondon(),
      note: 'Weekly shop',
    })
    const headers = new Headers((call[1] as RequestInit).headers)
    expect(headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/)

    // Amount and note are cleared; category and date stay for quick entry.
    expect(screen.getByLabelText('Amount (£)')).toHaveValue('')
    expect(screen.getByLabelText('Amount (£)')).toHaveFocus()
    expect(screen.getByLabelText('Note (optional)')).toHaveValue('')
    expect(screen.getByLabelText('Category')).toHaveValue('c-groc')
    expect(screen.getByLabelText('Date')).toHaveValue(todayInLondon())
  })

  it('shows only active categories of the chosen type', async () => {
    const user = userEvent.setup()
    setup()
    renderApp('/transactions/new')

    const select = await screen.findByLabelText('Category')
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Groceries' })).toBeInTheDocument())
    expect(within(select).queryByRole('option', { name: 'Old stuff' })).not.toBeInTheDocument()
    expect(within(select).queryByRole('option', { name: 'Salary' })).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('Income'))
    expect(within(select).getByRole('option', { name: 'Salary' })).toBeInTheDocument()
    expect(within(select).queryByRole('option', { name: 'Groceries' })).not.toBeInTheDocument()
  })

  it('remembers the last category used', async () => {
    const user = userEvent.setup()
    setup({ [ADD]: () => saved({ transaction_type: 'expense', amount_pence: 300, occurred_on: todayInLondon() }, 'Transport') })
    const first = renderApp('/transactions/new')
    await fill(user, '3', 'Transport')
    await user.click(screen.getByRole('button', { name: 'Save entry' }))
    await screen.findByText(/Saved:/)
    first.unmount()

    renderApp('/transactions/new')
    await waitFor(() => expect(screen.getByLabelText('Category')).toHaveValue('c-trans'))
    expect(localStorage.getItem(`spendwise.lastCategory.${TEST_USER.id}.expense`)).toBe('c-trans')
  })

  it('checks the form before sending anything', async () => {
    const user = userEvent.setup()
    const api = setup()
    renderApp('/transactions/new')

    await user.type(await screen.findByLabelText('Amount (£)'), '12.345')
    await user.click(screen.getByRole('button', { name: 'Save entry' }))

    expect(await screen.findByText(/Enter an amount between £0.01 and £999,999.99/)).toBeInTheDocument()
    expect(screen.getByText('Choose a category', { selector: '.field-error' })).toBeInTheDocument()
    expect(screen.getByLabelText('Amount (£)')).toHaveFocus()
    expect(api.callsTo(ADD)).toHaveLength(0)
  })

  it("shows the server's field errors next to the right field", async () => {
    const user = userEvent.setup()
    setup({
      [ADD]: () =>
        errorResponse(422, 'validation_failed', 'Some fields need attention.', {
          field_errors: { category_id: 'That category is archived. Choose another one' },
        }),
    })
    renderApp('/transactions/new')

    await fill(user, '5')
    await user.click(screen.getByRole('button', { name: 'Save entry' }))

    expect(await screen.findByText('That category is archived. Choose another one')).toBeInTheDocument()
    expect(screen.getByLabelText('Category')).toHaveAttribute('aria-invalid', 'true')
  })

  it('keeps the same key when retrying after a connection drop, so nothing saves twice', async () => {
    const user = userEvent.setup()
    let attempt = 0
    const api = setup({
      [ADD]: () => {
        attempt += 1
        if (attempt === 1) throw new TypeError('Failed to fetch')
        return saved({ transaction_type: 'expense', amount_pence: 500, occurred_on: todayInLondon() }, 'Groceries')
      },
    })
    renderApp('/transactions/new')

    await fill(user, '5')
    await user.click(screen.getByRole('button', { name: 'Save entry' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't reach SpendWise/)

    await user.click(screen.getByRole('button', { name: 'Save entry' }))
    await screen.findByText(/Saved:/)

    const keys = api.callsTo(ADD).map((c) => new Headers((c[1] as RequestInit).headers).get('Idempotency-Key'))
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })

  it('lists recent entries', async () => {
    setup({
      [RECENT]: jsonResponse(200, {
        data: [
          { id: 'a', transaction_type: 'income', amount_pence: 250000, occurred_on: '2026-11-01', note: null, category_name: 'Salary' },
          { id: 'b', transaction_type: 'expense', amount_pence: 1250, occurred_on: '2026-10-31', note: 'Shop', category_name: 'Groceries' },
        ],
      }),
    })
    renderApp('/transactions/new')

    const list = (await screen.findByText('Salary', { selector: '.entry-category' })).closest('ul')!
    const entries = within(list).getAllByRole('listitem')
    expect(entries[0]).toHaveTextContent('Salary')
    expect(entries[0]).toHaveTextContent('+£2,500.00')
    expect(entries[0]).toHaveTextContent('1 Nov 2026')
    expect(entries[1]).toHaveTextContent('−£12.50')
    expect(entries[1]).toHaveTextContent('31 Oct 2026 · Shop')
  })
})
