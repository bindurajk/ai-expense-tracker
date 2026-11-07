import { INVALID_EMAIL_MESSAGE, mapAuthError, RATE_LIMIT_MESSAGE, UNDELIVERABLE_EMAIL_MESSAGE } from './authErrors'

describe('mapAuthError', () => {
  it('explains when Supabase cannot email the address (e.g. example.com)', () => {
    expect(mapAuthError({ code: 'email_address_invalid', status: 400 })).toEqual({
      field: 'email',
      message: UNDELIVERABLE_EMAIL_MESSAGE,
    })
    expect(mapAuthError({ code: 'email_address_not_authorized', status: 400 }).message).toBe(
      UNDELIVERABLE_EMAIL_MESSAGE,
    )
  })

  it('keeps format problems and rate limits separate', () => {
    expect(mapAuthError({ code: 'validation_failed' }).message).toBe(INVALID_EMAIL_MESSAGE)
    expect(mapAuthError({ status: 429 }).message).toBe(RATE_LIMIT_MESSAGE)
  })
})
