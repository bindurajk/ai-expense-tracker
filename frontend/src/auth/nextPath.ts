// After sign-in we send people back to the page they asked for.
// Only same-site paths are allowed, so a crafted link cannot bounce users to another website.
export function safeNextPath(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (!raw) return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  return raw
}
