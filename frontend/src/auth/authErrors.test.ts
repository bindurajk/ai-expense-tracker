import {
  ACCOUNT_EXISTS_MESSAGE,
  GENERIC_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  mapAuthError,
  NETWORK_MESSAGE,
  RATE_LIMIT_MESSAGE,
  SERVICE_UNAVAILABLE_MESSAGE,
} from './authErrors'

describe('mapAuthError', () => {
  it.each([
    [{ code: 'rate_limited', status: 429 }, 'rate_limited', RATE_LIMIT_MESSAGE],
    [{ code: 'network_error', status: 0 }, 'network_error', NETWORK_MESSAGE],
    [{ code: 'account_exists', status: 409 }, 'account_exists', ACCOUNT_EXISTS_MESSAGE],
    [{ code: 'invalid_credentials', status: 401 }, 'invalid_credentials', INVALID_CREDENTIALS_MESSAGE],
    [{ code: 'service_unavailable', status: 503 }, 'service_unavailable', SERVICE_UNAVAILABLE_MESSAGE],
    [{ code: 'http_error', status: 500 }, 'generic', GENERIC_MESSAGE],
    [null, 'generic', GENERIC_MESSAGE],
  ])('%o → %s', (error, kind, message) => {
    expect(mapAuthError(error)).toEqual({ kind, message })
  })
})
