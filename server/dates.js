/**
 * Plain calendar dates, in the machine's own timezone.
 *
 * `toISOString()` converts to UTC first, so east of Greenwich a locally built
 * midnight lands on the previous day: in Dhaka, `new Date(2026, 8, 1)` comes
 * back as "2026-08-31". Every date in this app is a calendar date, never an
 * instant, so they are formatted from local parts instead.
 */

export const DAY = 86_400_000

const pad = (n) => String(n).padStart(2, '0')

export function localIso(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const today = () => localIso()

/** Parses YYYY-MM-DD as local midnight, not as a UTC instant. */
export function parseIso(isoDate) {
  const [y, m, d] = String(isoDate).slice(0, 10).split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function addDays(isoDate, n) {
  const d = parseIso(isoDate)
  d.setDate(d.getDate() + n)
  return localIso(d)
}

export function addMonths(isoDate, n) {
  const d = parseIso(isoDate)
  d.setMonth(d.getMonth() + n)
  return localIso(d)
}

/** Whole days from one calendar date to another; same date is 0. */
export function daysBetween(from, to) {
  return Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / DAY)
}

export function startOfMonth(isoDate = today()) {
  const d = parseIso(isoDate)
  return localIso(new Date(d.getFullYear(), d.getMonth(), 1))
}

export function endOfMonth(isoDate = today()) {
  const d = parseIso(isoDate)
  return localIso(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}
