// Reads the browser-safe settings from Vite environment variables.
// Only public values belong here (the Supabase URL and its public "anon" key).
// Secret keys must never be given a VITE_ prefix, because Vite puts those into the browser bundle.

export type AppConfig =
  | { ok: true; supabaseUrl: string; supabaseAnonKey: string }
  | { ok: false; problems: string[] }

type EnvLike = Record<string, unknown>

export function readConfig(env: EnvLike = import.meta.env): AppConfig {
  const url = String(env.VITE_SUPABASE_URL ?? '').trim()
  const key = String(env.VITE_SUPABASE_ANON_KEY ?? '').trim()
  const problems: string[] = []

  if (!url) {
    problems.push('VITE_SUPABASE_URL is not set.')
  } else if (!/^https?:\/\/[^\s]+$/.test(url)) {
    problems.push('VITE_SUPABASE_URL must be a web address starting with https://.')
  }
  if (!key) {
    problems.push('VITE_SUPABASE_ANON_KEY is not set.')
  }

  // Never include the values themselves in messages.
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, supabaseUrl: url, supabaseAnonKey: key }
}
