import { useQueryClient } from '@tanstack/react-query'
import type { Session as SupabaseSession } from '@supabase/supabase-js'
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { readConfig, type AppConfig } from '../config'
import { getSupabase, type AuthClient } from '../lib/supabase'

// Two kinds of session:
// - "supabase": a real account. Supabase manages passwords and tokens; we only read who is signed in.
// - "demo": development only, so the private layout can be previewed. It holds no data and
//   disappears on refresh or sign out.
export type Session =
  | { kind: 'demo'; displayName: string }
  | { kind: 'supabase'; userId: string; email: string; emailVerified: boolean }

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out'

type AuthValue = {
  config: AppConfig
  client: AuthClient | null
  status: AuthStatus
  session: Session | null
  demoAllowed: boolean
  startDemo: () => void
  signOut: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

type Props = {
  children: ReactNode
  config?: AppConfig
  demoAllowed?: boolean
  /** Supabase Auth client. Leave out to use the app's real client; tests pass a fake; null means none. */
  client?: AuthClient | null
}

function toSession(s: SupabaseSession | null): Session | null {
  if (!s?.user) return null
  return {
    kind: 'supabase',
    userId: s.user.id,
    email: s.user.email ?? '',
    emailVerified: Boolean(s.user.email_confirmed_at),
  }
}

export function AuthProvider({ children, config, demoAllowed = import.meta.env.DEV, client }: Props) {
  const queryClient = useQueryClient()
  const [resolvedConfig] = useState<AppConfig>(() => config ?? readConfig())
  const [authClient] = useState<AuthClient | null>(() =>
    client !== undefined ? client : (getSupabase(resolvedConfig)?.auth ?? null),
  )
  const [demoSession, setDemoSession] = useState<Session | null>(null)
  const [realSession, setRealSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(authClient === null)

  useEffect(() => {
    if (!authClient) return
    let active = true

    const { data } = authClient.onAuthStateChange((_event, s) => {
      if (!active) return
      setRealSession(toSession(s))
      setReady(true)
    })

    authClient
      .getSession()
      .then(({ data: result }) => {
        if (active) setRealSession(toSession(result.session))
      })
      .catch(() => {
        if (active) setRealSession(null)
      })
      .finally(() => {
        if (active) setReady(true)
      })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [authClient])

  const startDemo = useCallback(() => {
    if (demoAllowed) setDemoSession({ kind: 'demo', displayName: 'Demo user' })
  }, [demoAllowed])

  const signOut = useCallback(() => {
    const hadRealSession = realSession !== null
    // Remove every cached private response so the next person sees nothing.
    queryClient.clear()
    // React Router applies navigation as a transition; doing the same here keeps both updates
    // together, so the route guard never sees "signed out" while still on a private page.
    startTransition(() => {
      setDemoSession(null)
      setRealSession(null)
    })
    if (hadRealSession && authClient) {
      // Supabase removes its stored tokens. Failures are ignored: we have already signed out locally.
      authClient.signOut().catch(() => undefined)
    }
  }, [queryClient, realSession, authClient])

  const session = demoSession ?? realSession
  const status: AuthStatus = session ? 'signed-in' : ready ? 'signed-out' : 'loading'

  const value = useMemo(
    () => ({
      config: resolvedConfig,
      client: authClient,
      status,
      session,
      demoAllowed,
      startDemo,
      signOut,
    }),
    [resolvedConfig, authClient, status, session, demoAllowed, startDemo, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
