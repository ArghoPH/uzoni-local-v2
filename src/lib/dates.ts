import {
  addDays, addMonths, endOfMonth, endOfWeek, endOfYear, format, parseISO,
  startOfMonth, startOfWeek, startOfYear, subDays, subMonths, isValid,
} from 'date-fns'

export type RangeKey =
  | 'this_month' | 'last_month' | 'last_30' | 'last_90'
  | 'this_week' | 'this_year' | 'last_year' | 'all' | 'custom'

export interface DateRange { from: string; to: string }

/** Postgres `date` columns are plain YYYY-MM-DD — keep them that way, no timezone drift. */
export const iso = (d: Date): string => format(d, 'yyyy-MM-dd')

export const parseDate = (s: string | null | undefined): Date | null => {
  if (!s) return null
  const d = parseISO(s)
  return isValid(d) ? d : null
}

export const today = (): string => iso(new Date())

export function rangeFor(key: RangeKey, weekStartsOn: number = 6): DateRange {
  const now = new Date()
  const wso = (weekStartsOn % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6
  switch (key) {
    case 'this_month':
      return { from: iso(startOfMonth(now)), to: iso(endOfMonth(now)) }
    case 'last_month': {
      const m = subMonths(now, 1)
      return { from: iso(startOfMonth(m)), to: iso(endOfMonth(m)) }
    }
    case 'last_30':
      return { from: iso(subDays(now, 29)), to: iso(now) }
    case 'last_90':
      return { from: iso(subDays(now, 89)), to: iso(now) }
    case 'this_week':
      return { from: iso(startOfWeek(now, { weekStartsOn: wso })), to: iso(endOfWeek(now, { weekStartsOn: wso })) }
    case 'this_year':
      return { from: iso(startOfYear(now)), to: iso(endOfYear(now)) }
    case 'last_year': {
      const y = new Date(now.getFullYear() - 1, 0, 1)
      return { from: iso(startOfYear(y)), to: iso(endOfYear(y)) }
    }
    case 'all':
      return { from: '1970-01-01', to: iso(addDays(now, 3650)) }
    default:
      return { from: iso(startOfMonth(now)), to: iso(endOfMonth(now)) }
  }
}

export const RANGE_LABELS: Record<Exclude<RangeKey, 'custom'>, string> = {
  this_month: 'This month',
  last_month: 'Last month',
  last_30: 'Last 30 days',
  last_90: 'Last 90 days',
  this_week: 'This week',
  this_year: 'This year',
  last_year: 'Last year',
  all: 'All time',
}

/** Group heading for a transaction list: Today / Yesterday / 12 Sep 2026 */
export function dayHeading(isoDate: string): string {
  const d = parseDate(isoDate)
  if (!d) return isoDate
  const t = new Date()
  if (iso(d) === iso(t)) return 'Today'
  if (iso(d) === iso(subDays(t, 1))) return 'Yesterday'
  if (iso(d) === iso(addDays(t, 1))) return 'Tomorrow'
  return format(d, d.getFullYear() === t.getFullYear() ? 'EEE, d MMM' : 'd MMM yyyy')
}

export function shortDate(isoDate: string): string {
  const d = parseDate(isoDate)
  return d ? format(d, 'd MMM yyyy') : isoDate
}

export function monthLabel(isoDate: string): string {
  const d = parseDate(isoDate)
  return d ? format(d, 'MMM yyyy') : isoDate
}

export function bucketLabel(isoDate: string, bucket: 'day' | 'week' | 'month' | 'year'): string {
  const d = parseDate(isoDate)
  if (!d) return isoDate
  if (bucket === 'day') return format(d, 'd MMM')
  if (bucket === 'week') return format(d, 'd MMM')
  if (bucket === 'year') return format(d, 'yyyy')
  return format(d, 'MMM')
}

/** First day of the month containing a date, as YYYY-MM-DD. */
export function startOfMonthIso(isoDate?: string): string {
  const d = isoDate ? parseDate(isoDate) ?? new Date() : new Date()
  return iso(new Date(d.getFullYear(), d.getMonth(), 1))
}

/** Days until a date; negative means it is already past. */
export function daysUntil(isoDate: string): number {
  const d = parseDate(isoDate)
  if (!d) return 0
  const a = new Date(); a.setHours(0, 0, 0, 0)
  const b = new Date(d); b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

export function dueLabel(isoDate: string): string {
  const n = daysUntil(isoDate)
  if (n === 0) return 'Due today'
  if (n === 1) return 'Due tomorrow'
  if (n === -1) return '1 day overdue'
  if (n < 0) return `${-n} days overdue`
  if (n < 30) return `Due in ${n} days`
  return `Due ${shortDate(isoDate)}`
}

/** Sensible default chart bucket for a range. */
export function bucketFor(range: DateRange): 'day' | 'week' | 'month' | 'year' {
  const a = parseDate(range.from); const b = parseDate(range.to)
  if (!a || !b) return 'month'
  const days = Math.abs((b.getTime() - a.getTime()) / 86_400_000)
  if (days <= 62) return 'day'
  if (days <= 190) return 'week'
  if (days <= 1100) return 'month'
  return 'year'
}

export { addMonths, startOfMonth, endOfMonth, format }
