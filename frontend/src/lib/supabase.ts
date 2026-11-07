import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readConfig, type AppConfig } from '../config'

// The parts of Supabase Auth the app uses. Tests pass a fake object with this shape,
// so no test ever talks to the network.
export type AuthClient = Pick<
  SupabaseClient['auth'],
  'getSession' | 'onAuthStateChange' | 'signOut' | 'signUp' | 'resend'
>

let client: SupabaseClient | null = null

// Creates the Supabase client the first time it is needed, and only when the settings are valid.
// Returns null when the app is not set up, so callers can show a friendly message instead.
// Sessions use Supabase's own bearer tokens in its default browser storage; we never store passwords.
export function getSupabase(config: AppConfig = readConfig()): SupabaseClient | null {
  if (!config.ok) return null
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  }
  return client
}
