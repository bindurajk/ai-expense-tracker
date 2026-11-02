import { useQueryClient } from '@tanstack/react-query'
import { createContext, startTransition, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { readConfig, type AppConfig } from '../config'

// F01 only knows "signed in" or "signed out". Real Supabase sessions arrive in A01/A02.
// The demo session exists only in development so the private layout can be previewed.
// It holds no data and disappears on refresh or sign out.
export type Session = { kind: 'demo'; displayName: string }

type AuthValue = {
  config: AppConfig
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
}

export function AuthProvider({ children, config, demoAllowed = import.meta.env.DEV }: Props) {
  const queryClient = useQueryClient()
  const [resolvedConfig] = useState<AppConfig>(() => config ?? readConfig())
  const [session, setSession] = useState<Session | null>(null)

  const startDemo = useCallback(() => {
    if (demoAllowed) setSession({ kind: 'demo', displayName: 'Demo user' })
  }, [demoAllowed])

  const signOut = useCallback(() => {
    // Remove every cached private response so the next person sees nothing.
    queryClient.clear()
    // React Router applies navigation as a transition; doing the same here keeps both updates
    // together, so the route guard never sees "signed out" while still on a private page.
    startTransition(() => setSession(null))
  }, [queryClient])

  const value = useMemo(
    () => ({ config: resolvedConfig, session, demoAllowed, startDemo, signOut }),
    [resolvedConfig, session, demoAllowed, startDemo, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
