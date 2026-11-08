import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '../auth/AuthContext'
import { ApiError, apiFetch } from '../lib/api'
import { formatIsoDate, formatPence, parsePoundsToPence, todayInLondon } from '../lib/money'
import { usePageTitle } from '../usePageTitle'

// T01 add expense + T02 add income, built for quick entry: today's date and the last
// category you used are filled in, and after saving the form stays open for the next one.

type EntryType = 'expense' | 'income'
type Category = { id: string; name: string; category_type: EntryType; archived_at: string | null }
type Transaction = {
  id: string
  transaction_type: EntryType
  amount_pence: number
  occurred_on: string
  note: string | null
  category_name: string
}

const NOTE_MAX = 140

const entrySchema = z.object({
  transaction_type: z.enum(['expense', 'income']),
  amount: z
    .string()
    .trim()
    .min(1, { error: 'Enter an amount' })
    .refine((v) => parsePoundsToPence(v) !== null, {
      error: 'Enter an amount between £0.01 and £999,999.99, like 12.50',
    }),
  category_id: z.string().min(1, { error: 'Choose a category' }),
  occurred_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Enter a date' })
    .refine((v) => v >= '2000-01-01', { error: 'Enter a date from 2000 onwards' })
    .refine((v) => v <= todayInLondon(), { error: "The date can't be in the future" }),
  note: z.string().max(NOTE_MAX, { error: `Keep the note to ${NOTE_MAX} characters or fewer` }),
})

type EntryValues = z.infer<typeof entrySchema>
type FieldName = keyof EntryValues

// The API's field names → this form's field names.
const SERVER_FIELDS: Record<string, FieldName> = {
  transaction_type: 'transaction_type',
  amount_pence: 'amount',
  category_id: 'category_id',
  occurred_on: 'occurred_on',
  note: 'note',
}

// Remembering the last category is a convenience only: if storage is blocked, nothing breaks.
function lastCategoryKey(userId: string, type: EntryType) {
  return `spendwise.lastCategory.${userId}.${type}`
}
function readLastCategory(userId: string, type: EntryType): string | null {
  try {
    return localStorage.getItem(lastCategoryKey(userId, type))
  } catch {
    return null
  }
}
function saveLastCategory(userId: string, type: EntryType, id: string) {
  try {
    localStorage.setItem(lastCategoryKey(userId, type), id)
  } catch {
    // ignore
  }
}

function newKey(): string {
  return crypto.randomUUID()
}

export function NewTransaction() {
  usePageTitle('Add entry')
  const { session } = useAuth()

  if (session?.kind !== 'user') {
    return (
      <section className="page narrow">
        <h1>Add entry</h1>
        <div className="notice notice-warning">
          This is a preview without an account, so entries can't be saved.{' '}
          <Link to="/signup">Create a free account</Link> to start recording.
        </div>
      </section>
    )
  }
  return <EntryForm userId={session.userId} />
}

function EntryForm({ userId }: { userId: string }) {
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  // One key per entry: retrying after a dropped connection can never save it twice.
  const idempotencyKey = useRef(newKey())
  const inFlight = useRef(false)

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<{ data: Category[] }>('/api/categories').then((r) => r.data),
  })
  const recentQuery = useQuery({
    queryKey: ['transactions', 'recent'],
    queryFn: () => apiFetch<{ data: Transaction[] }>('/api/transactions/recent?limit=5').then((r) => r.data),
  })

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    setFocus,
    resetField,
    watch,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<EntryValues>({
    resolver: zodResolver(entrySchema),
    defaultValues: {
      transaction_type: 'expense',
      amount: '',
      category_id: '',
      occurred_on: todayInLondon(),
      note: '',
    },
  })

  const type = watch('transaction_type')
  const noteLength = watch('note').length
  const categories = (categoriesQuery.data ?? []).filter((c) => c.category_type === type && !c.archived_at)

  // When the type or the category list changes, pick the remembered category (or none).
  useEffect(() => {
    if (!categoriesQuery.data) return
    const current = getValues('category_id')
    if (categories.some((c) => c.id === current)) return
    const remembered = readLastCategory(userId, type)
    setValue('category_id', categories.some((c) => c.id === remembered) ? (remembered ?? '') : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, categoriesQuery.data, userId])

  // Any change to the entry after an error means it's a new attempt with its own key.
  function startNewAttempt() {
    idempotencyKey.current = newKey()
  }

  async function onSubmit(values: EntryValues) {
    if (inFlight.current) return
    inFlight.current = true
    setFormError(null)
    setSaved(null)
    const amountPence = parsePoundsToPence(values.amount)!
    try {
      const result = await apiFetch<{ data: Transaction }>('/api/transactions', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey.current },
        body: {
          transaction_type: values.transaction_type,
          amount_pence: amountPence,
          category_id: values.category_id,
          occurred_on: values.occurred_on,
          note: values.note.trim() || null,
        },
      })
      const t = result.data
      saveLastCategory(userId, values.transaction_type, values.category_id)
      setSaved(
        `Saved: ${formatPence(t.amount_pence)} ${t.transaction_type} in ${t.category_name}, ${formatIsoDate(t.occurred_on)}.`,
      )
      startNewAttempt()
      // Keep type, category and date for the next entry; clear what's different each time.
      resetField('amount')
      resetField('note')
      setFocus('amount')
      void queryClient.invalidateQueries({ queryKey: ['transactions'] })
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null
      const fields = apiError?.status === 422 ? apiError.fieldErrors : undefined
      const mapped = Object.entries(fields ?? {}).filter(([name]) => SERVER_FIELDS[name])
      if (mapped.length > 0) {
        mapped.forEach(([name, message], i) =>
          setError(SERVER_FIELDS[name], { type: 'server', message }, { shouldFocus: i === 0 }),
        )
        startNewAttempt()
      } else if (apiError?.status === 401) {
        setFormError('Your session has ended. Sign in again, then add this entry.')
      } else if (apiError?.code === 'network_error') {
        // Same key on purpose: if the first try did reach the server, retrying won't duplicate it.
        setFormError("We couldn't reach SpendWise, so this entry may not be saved. Check your connection and press Save again.")
      } else {
        setFormError(apiError?.message ?? 'Something went wrong. Please try again.')
        startNewAttempt()
      }
    } finally {
      inFlight.current = false
    }
  }

  const describe = (id: string, hint?: boolean, error?: string) =>
    [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined

  return (
    <section className="page narrow">
      <h1>Add entry</h1>

      {categoriesQuery.isError ? (
        <div className="notice notice-error" role="alert">
          Your categories could not be loaded, so entries can't be added right now.{' '}
          <button type="button" className="link-button" onClick={() => void categoriesQuery.refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <form className="form" noValidate onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
          <fieldset disabled={categoriesQuery.isPending}>
            <legend className="visually-hidden">Entry details</legend>
            {formError && (
              <div className="notice notice-error" role="alert">
                {formError}
              </div>
            )}

            <fieldset className="segmented">
              <legend>Type</legend>
              <div className="segmented-options">
                {(['expense', 'income'] as const).map((value) => (
                  <label key={value} className="segmented-option">
                    <input type="radio" value={value} {...register('transaction_type')} />
                    <span>{value === 'expense' ? 'Expense' : 'Income'}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="field">
              <label htmlFor="entry-amount">Amount (£)</label>
              <input
                id="entry-amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                aria-invalid={errors.amount ? true : undefined}
                aria-describedby={describe('entry-amount', false, errors.amount?.message)}
                {...register('amount')}
              />
              {errors.amount && (
                <p id="entry-amount-error" className="field-error">
                  {errors.amount.message}
                </p>
              )}
            </div>

            <div className="field">
              <label htmlFor="entry-category">Category</label>
              <select
                id="entry-category"
                aria-invalid={errors.category_id ? true : undefined}
                aria-describedby={describe('entry-category', false, errors.category_id?.message)}
                {...register('category_id')}
              >
                <option value="">{categoriesQuery.isPending ? 'Loading…' : 'Choose a category'}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {errors.category_id && (
                <p id="entry-category-error" className="field-error">
                  {errors.category_id.message}
                </p>
              )}
            </div>

            <div className="field">
              <label htmlFor="entry-date">Date</label>
              <input
                id="entry-date"
                type="date"
                min="2000-01-01"
                max={todayInLondon()}
                aria-invalid={errors.occurred_on ? true : undefined}
                aria-describedby={describe('entry-date', false, errors.occurred_on?.message)}
                {...register('occurred_on')}
              />
              {errors.occurred_on && (
                <p id="entry-date-error" className="field-error">
                  {errors.occurred_on.message}
                </p>
              )}
            </div>

            <div className="field">
              <label htmlFor="entry-note">Note (optional)</label>
              <input
                id="entry-note"
                type="text"
                autoComplete="off"
                maxLength={NOTE_MAX}
                aria-invalid={errors.note ? true : undefined}
                aria-describedby={describe('entry-note', true, errors.note?.message)}
                {...register('note')}
              />
              <p id="entry-note-hint" className="field-hint">
                For example "Weekly shop". {NOTE_MAX - noteLength} characters left.
              </p>
              {errors.note && (
                <p id="entry-note-error" className="field-error">
                  {errors.note.message}
                </p>
              )}
            </div>

            <button type="submit" className="button button-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save entry'}
            </button>
            <p className={saved ? 'notice notice-success' : 'visually-hidden'} role="status">
              {isSubmitting ? 'Saving…' : (saved ?? '')}
            </p>
          </fieldset>
        </form>
      )}

      <h2>Recent entries</h2>
      {recentQuery.isPending ? (
        <p className="muted">Loading…</p>
      ) : recentQuery.isError ? (
        <p className="muted">Recent entries could not be loaded.</p>
      ) : recentQuery.data.length === 0 ? (
        <p className="muted">Nothing recorded yet. Your entries will appear here.</p>
      ) : (
        <ul className="entry-list">
          {recentQuery.data.map((t) => (
            <li key={t.id}>
              <span className="entry-main">
                <span className="entry-category">{t.category_name}</span>
                <span className="entry-meta">
                  {formatIsoDate(t.occurred_on)}
                  {t.note ? ` · ${t.note}` : ''}
                </span>
              </span>
              <span className={`entry-amount ${t.transaction_type}`}>
                {t.transaction_type === 'income' ? '+' : '−'}
                {formatPence(t.amount_pence)}
                <span className="visually-hidden"> {t.transaction_type}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
