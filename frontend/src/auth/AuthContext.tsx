import { useQueryClient } from '@tanstack/react-query'
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
import { ApiError, apiFetch } from '../lib/api'

// Two kinds of session:
// - "user": a real account. The backend keeps the session in an HttpOnly cookie, so the app
//   never sees or stores a token; it only knows who is signed in.
// - "demo": development only, so the private layout can be previewed. It holds no data and
//   disappears on refresh or sign out.
export type Session =
  | { kind: 'demo'; displayName: string }
  | { kind: 'user'; userId: string; email: string }

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out'

export type AuthUser = { id: string; email: string }

type UserResponse = { data: { user: AuthUser } }

type AuthValue = {
  status: AuthStatus
  session: Session | null
  /** Set when the session check could not reach a working backend (503 or network failure). */
  serviceProblem: string | null
  demoAllowed: boolean
  startDemo: () => void
  signUp: (email: string, password: string) => Promise<AuthUser>
  signIn: (email: string, password: string) => Promise<AuthUser>
  signOut: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

type Props = {
  children: ReactNode
  demoAllowed?: boolean
}

function toSession(user: AuthUser): Session {
  return { kind: 'user', userId: user.id, email: user.email }
}

export function AuthProvider({ children, demoAllowed = import.meta.env.DEV }: Props) {
  const queryClient = useQueryClient()
  const [demoSession, setDemoSession] = useState<Session | null>(null)
  const [realSession, setRealSession] = useState<Session | null>(null)
  const [serviceProblem, setServiceProblem] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    apiFetch<UserResponse>('/api/auth/me')
      .then((result) => {
        if (!active) return
        setRealSession(result?.data?.user ? toSession(result.data.user) : null)
      })
      .catch((error: unknown) => {
        if (!active) return
        setRealSession(null)
        // 401 just means "not signed in". Anything else means the server is missing or broken.
        if (!(error instanceof ApiError && error.status === 401)) {
          setServiceProblem(
            error instanceof ApiError && error.code === 'network_error'
              ? 'The SpendWise server could not be reached.'
              : 'The SpendWise server is not set up yet.',
          )
        }
      })
      .finally(() => {
        if (active) setReady(true)
      })
    return () => {
      active = false
    }
  }, [])

  const startDemo = useCallback(() => {
    if (demoAllowed) setDemoSession({ kind: 'demo', displayName: 'Demo user' })
  }, [demoAllowed])

  const authenticate = useCallback(
    async (path: string, email: string, password: string) => {
      const result = await apiFetch<UserResponse>(path, { method: 'POST', body: { email, password } })
      const user = result.data.user
      // Start from an empty cache so nothing from a previous person can show.
      queryClient.clear()
      setServiceProblem(null)
      setRealSession(toSession(user))
      return user
    },
    [queryClient],
  )

  const signUp = useCallback(
    (email: string, password: string) => authenticate('/api/auth/signup', email, password),
    [authenticate],
  )
  const signIn = useCallback(
    (email: string, password: string) => authenticate('/api/auth/login', email, password),
    [authenticate],
  )

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
    if (hadRealSession) {
      // The backend clears the cookie. Failures are ignored: we have already signed out locally.
      apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    }
  }, [queryClient, realSession])

  const session = demoSession ?? realSession
  const status: AuthStatus = session ? 'signed-in' : ready ? 'signed-out' : 'loading'

  const value = useMemo(
    () => ({ status, session, serviceProblem, demoAllowed, startDemo, signUp, signIn, signOut }),
    [status, session, serviceProblem, demoAllowed, startDemo, signUp, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
