import type { UseFormRegisterReturn } from 'react-hook-form'

type Props = {
  id: string
  label: string
  type?: 'email' | 'password' | 'text'
  autoComplete?: string
  hint?: string
  error?: string
  registration: UseFormRegisterReturn
}

// A labelled input with an optional hint and error message, both linked with aria-describedby
// so screen readers read them out with the field.
export function Field({ id, label, type = 'text', autoComplete, hint, error, registration }: Props) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...registration}
      />
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  )
}
