// Money is whole pence (integers) everywhere. Typed amounts are parsed as text, never via
// floating point, so "0.10 + 0.20" style rounding errors cannot happen.

export const MAX_AMOUNT_PENCE = 99_999_999 // £999,999.99

/** "12", "12.5", "£1,234.56" → pence. Returns null if it isn't a valid positive amount. */
export function parsePoundsToPence(input: string): number | null {
  const cleaned = input.trim().replace(/^£/, '').replace(/,/g, '').trim()
  const match = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(cleaned)
  if (!match) return null
  const pence = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return pence >= 1 && pence <= MAX_AMOUNT_PENCE ? pence : null
}

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })

/** 1250 → "£12.50" */
export function formatPence(pence: number): string {
  return gbp.format(pence / 100)
}

/** Today's date in the UK as "YYYY-MM-DD" (what a date input and the API use). */
export function todayInLondon(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now)
}

const ukDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** "2026-11-08" → "8 Nov 2026" */
export function formatIsoDate(iso: string): string {
  return ukDate.format(new Date(`${iso}T00:00:00Z`))
}
