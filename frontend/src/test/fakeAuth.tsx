import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter, type InitialEntry } from 'react-router-dom'
import { vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import type { AppConfig } from '../config'
import type { AuthClient } from '../lib/supabase'
import { AppRoutes } from '../routes'
import { LocationProbe } from './LocationProbe'

// Test-only helpers: a fake Supabase Auth client (no network) and a render helper.

export const okConfig: AppConfig = { ok: true, supabaseUrl: 'https://example.test', supabaseAnonKey: 'test-key' }

type FakeUser = { email: string; verified: boolean }

export function fakeSession({ email, verified }: FakeUser) {
  return {
    access_token: 'fake-access-token',
    refresh_token: 'fake-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    user: {
      id: 'user-1',
      email,
      email_confirmed_at: verified ? '2026-11-02T10:00:00Z' : null,
    },
  }
}

type Options = {
  /** The session getSession() resolves to. Use 'pending' to keep it loading forever. */
  session?: ReturnType<typeof fakeSession> | null | 'pending'
}

export function createFakeAuth({ session = null }: Options = {}) {
  let listener: ((event: string, s: unknown) => void) | null = null
  let current = session === 'pending' ? null : session
  let pending = session === 'pending'
  const waiting: ((value: unknown) => void)[] = []

  const fake = {
    // 'pending' stays unresolved until emit() reports a session, like a link exchange in progress.
    getSession: vi.fn(() =>
      pending
        ? new Promise((resolve) => waiting.push(resolve))
        : Promise.resolve({ data: { session: current }, error: null }),
    ),
    onAuthStateChange: vi.fn((cb: (event: string, s: unknown) => void) => {
      listener = cb
      return { data: { subscription: { id: 'sub', callback: cb, unsubscribe: vi.fn() } } }
    }),
    signOut: vi.fn(() => Promise.resolve({ error: null })),
    signUp: vi.fn(() =>
      Promise.resolve<{ data: unknown; error: unknown }>({
        data: { user: { id: 'new-user', identities: [{ id: 'identity' }] }, session: null },
        error: null,
      }),
    ),
    resend: vi.fn(() => Promise.resolve<{ data: unknown; error: unknown }>({ data: {}, error: null })),
  }

  return {
    fake,
    client: fake as unknown as AuthClient,
    /** Simulates Supabase reporting a new session (for example after the email link is exchanged). */
    emit(event: string, s: ReturnType<typeof fakeSession> | null) {
      current = s
      pending = false
      listener?.(event, s)
      waiting.splice(0).forEach((resolve) => resolve({ data: { session: s }, error: null }))
    },
  }
}


export function renderApp(
  entry: InitialEntry,
  { client, config = okConfig, strict = false }: { client: AuthClient | null; config?: AppConfig; strict?: boolean },
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const tree = (
    <QueryClientProvider client={queryClient}>
      <AuthProvider config={config} demoAllowed={false} client={client}>
        <MemoryRouter initialEntries={[entry]}>
          <AppRoutes />
          <LocationProbe />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
  return { queryClient, ...render(strict ? <StrictMode>{tree}</StrictMode> : tree) }
}

export function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
