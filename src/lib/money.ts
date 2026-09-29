import type { Currency } from './types'

/**
 * Money is stored as an integer count of minor units (paisa, cents) everywhere:
 * the database, the network, and this file. Floats never touch an amount.
 */

const FALLBACK: Currency = { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳', decimal_digits: 2 }

export function digitsOf(currencies: Record<string, Currency>, code: string): number {
  return currencies[code]?.decimal_digits ?? FALLBACK.decimal_digits
}

export function symbolOf(currencies: Record<string, Currency>, code: string): string {
  return currencies[code]?.symbol ?? code
}

/** 125050 minor + 2 digits -> 1250.5 */
export function toMajor(minor: number, digits: number): number {
  return minor / 10 ** digits
}

/** 1250.5 major + 2 digits -> 125050 */
export function toMinor(major: number, digits: number): number {
  return Math.round(major * 10 ** digits)
}

/**
 * Parse whatever a person typed into minor units.
 * Accepts "1,250.50", "1 250,50", "১২৫০" (Bengali digits), "12.5k", "-40".
 * Returns null when there is no number in there at all.
 */
export function parseAmount(input: string, digits: number): number | null {
  if (input == null) return null

  // Bengali and Arabic-Indic digits -> ASCII
  let s = input
    .replace(/[\u09E6-\u09EF]/g, (d) => String(d.charCodeAt(0) - 0x09e6))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  s = s.trim().replace(/\s/g, '')
  if (!s) return null

  let multiplier = 1
  const suffix = s.slice(-1).toLowerCase()
  if (suffix === 'k') { multiplier = 1_000; s = s.slice(0, -1) }
  else if (suffix === 'm') { multiplier = 1_000_000; s = s.slice(0, -1) }
  else if (suffix === 'l') { multiplier = 100_000; s = s.slice(0, -1) }      // lakh
  else if (suffix === 'c') { multiplier = 10_000_000; s = s.slice(0, -1) }   // crore

  const negative = /^\s*-/.test(s)
  s = s.replace(/[^\d.,]/g, '')
  if (!s) return null

  // Work out which separator (if any) is the decimal point.
  const dots = (s.match(/\./g) ?? []).length
  const commas = (s.match(/,/g) ?? []).length
  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  let sepAt = -1

  if (dots > 0 && commas > 0) {
    // Mixed separators: the rightmost one is the decimal point.
    sepAt = Math.max(lastDot, lastComma)
  } else if (dots === 1 || commas === 1) {
    const at = dots === 1 ? lastDot : lastComma
    const tail = s.length - at - 1
    const head = s.slice(0, at)
    if (tail !== 3) {
      // "1,25", "1.5", "1.2345" -> the separator is a decimal point.
      sepAt = at
    } else if (head === '' || head === '0' || digits >= 3) {
      // "0.005" is never a thousands group, and in a 3-decimal currency
      // "1.234" means one and 234 thousandths.
      sepAt = at
    } else {
      // "1,250" / "1.250" -> one thousand two hundred fifty.
      sepAt = -1
    }
  }
  // Repeated single separators ("1,250,000") are all thousands groups: sepAt stays -1.

  let intPart = sepAt >= 0 ? s.slice(0, sepAt) : s
  const fracPart = sepAt >= 0 ? s.slice(sepAt + 1) : ''
  intPart = intPart.replace(/[.,]/g, '')
  if (!intPart && !fracPart) return null

  const kept = fracPart.slice(0, digits).padEnd(digits, '0')
  const roundUp = fracPart.length > digits && Number(fracPart[digits]) >= 5 ? 1 : 0
  const minor = Number(intPart || '0') * 10 ** digits + Number(kept || '0') + roundUp
  if (!Number.isFinite(minor)) return null

  const result = Math.round(minor * multiplier)
  return negative ? -result : result
}

export interface FormatOptions {
  /** show the currency symbol (default true) */
  symbol?: boolean
  /** always show a leading + or - */
  signed?: boolean
  /** drop the decimals when they are all zero */
  compactZeros?: boolean
  locale?: string
}

export function formatMoney(
  minor: number,
  currency: Currency | undefined,
  opts: FormatOptions = {},
): string {
  const cur = currency ?? FALLBACK
  const { symbol = true, signed = false, compactZeros = false, locale = 'en-US' } = opts
  const digits = cur.decimal_digits
  const negative = minor < 0
  const abs = Math.abs(minor)
  const major = abs / 10 ** digits
  const showDigits = compactZeros && abs % 10 ** digits === 0 ? 0 : digits

  const body = new Intl.NumberFormat(locale, {
    minimumFractionDigits: showDigits,
    maximumFractionDigits: showDigits,
  }).format(major)

  const sign = negative ? '-' : signed ? '+' : ''
  return symbol ? `${sign}${cur.symbol}${gapAfter(cur.symbol)}${body}` : `${sign}${body}`
}

/**
 * A letter-based symbol (BDT, Rs, KD) needs air before the figure; a glyph
 * ($, €, ৳) sits tight against it. The space is non-breaking, so an amount
 * never wraps onto two lines.
 */
function gapAfter(symbol: string): string {
  if (/[A-Za-z]$/.test(symbol)) return '\u00A0'     // BDT, Rs, KD — needs a full space
  if (/[\u0980-\u09FF]$/.test(symbol)) return '\u2009'  // ৳ — a thin space is enough
  return ''                                        // $, €, £ sit tight
}

/** "৳12.5k" style, for tight spaces like chart axes. */
export function formatCompact(minor: number, currency: Currency | undefined, locale = 'en-US'): string {
  const cur = currency ?? FALLBACK
  const major = minor / 10 ** cur.decimal_digits
  const body = new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(major)
  return `${cur.symbol}${gapAfter(cur.symbol)}${body}`
}

/** Signed delta of a transaction against the account it is listed under. */
export function signedAmount(
  txn: { type: string; amount_minor: number; transfer_amount_minor: number | null; account_id: string; transfer_account_id: string | null },
  forAccountId?: string,
): number {
  if (txn.type === 'income') return txn.amount_minor
  if (txn.type === 'expense') return -txn.amount_minor
  if (forAccountId && txn.transfer_account_id === forAccountId) {
    return txn.transfer_amount_minor ?? txn.amount_minor
  }
  return -txn.amount_minor
}
