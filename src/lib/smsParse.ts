import { parseAmount } from './money'

/**
 * Reads a bank or mobile-wallet SMS and pulls out the transaction.
 *
 * No bank in Bangladesh offers a public transactions API, but every one of
 * them sends an SMS. Pasting that message is the closest thing to bank sync
 * that can exist here, and it costs a person two taps instead of a form.
 *
 * The hard part is not finding a number — a single message contains the
 * amount, the fee and the resulting balance, and picking the wrong one is
 * silently wrong. Each number is therefore matched together with the words
 * just before it, and anything labelled as a balance, fee or limit is set
 * aside rather than guessed at.
 */

export interface ParsedSms {
  amountMinor: number | null
  direction: 'income' | 'expense' | null
  payee: string | null
  occurredOn: string | null
  reference: string | null
  balanceMinor: number | null
  feeMinor: number | null
}

const CREDIT_WORDS = [
  'received', 'credited', 'credit', 'cash in', 'cashin', 'deposit', 'refund',
  'added', 'you have received', 'money received', 'salary',
]
const DEBIT_WORDS = [
  'debited', 'debit', 'cash out', 'cashout', 'sent', 'send money', 'payment',
  'paid', 'withdrawn', 'withdrawal', 'purchase', 'used for', 'spent', 'transferred to',
]

const NOT_THE_AMOUNT = ['balance', 'available', 'avail bal', 'bal', 'fee', 'charge', 'limit', 'vat']

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

const pad = (n: number) => String(n).padStart(2, '0')
const asIso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

/** Bengali and Arabic-Indic digits to ASCII, so the rest can assume 0-9. */
function normalize(text: string): string {
  return text
    .replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, ' ')
    .trim()
}

interface Hit { value: string; label: string; index: number }

/** Every money-looking number, tagged with the words immediately before it. */
function findAmounts(text: string): Hit[] {
  const pattern = /(?:(?:tk|bdt|৳|taka)\.?\s*)([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:tk|bdt|৳|taka)\b/gi
  const hits: Hit[] = []
  let m: RegExpExecArray | null

  while ((m = pattern.exec(text)) !== null) {
    const value = m[1] ?? m[2]
    if (!value) continue
    const before = text.slice(Math.max(0, m.index - 28), m.index).toLowerCase()
    const label = NOT_THE_AMOUNT.find((w) => before.includes(w)) ?? ''
    hits.push({ value, label, index: m.index })
  }
  return hits
}

function findDate(text: string): string | null {
  // 01/02/2026, 01-02-26, 2026-02-01
  const ymd = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/)
  if (ymd) return asIso(+ymd[1], +ymd[2], +ymd[3])

  const dmy = text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/)
  if (dmy) {
    const year = dmy[3].length === 2 ? 2000 + +dmy[3] : +dmy[3]
    // Day-first unless the first number cannot be a day.
    const a = +dmy[1]; const b = +dmy[2]
    const day = a > 12 ? a : b > 12 ? b : a
    const month = day === a ? b : a
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return asIso(year, month, day)
  }

  // 01-Feb-26 or 1 Feb 2026
  const named = text.match(/\b(\d{1,2})[-\s]([A-Za-z]{3})[a-z]*[-\s](\d{2,4})\b/)
  if (named) {
    const month = MONTHS[named[2].toLowerCase()]
    if (month) {
      const year = named[3].length === 2 ? 2000 + +named[3] : +named[3]
      return asIso(year, month, +named[1])
    }
  }
  return null
}

/*
  Where the name ends. A merchant run has to stop somewhere, and an SMS never
  punctuates one: "to Shwapno successful. Balance Tk 8,100" would otherwise be
  read as a very long shop name. Each capture is lazy and has to be followed by
  one of these.
*/
const STOP = String.raw`(?=\s*(?:\b(?:successful|success|completed|complete|on|at|via|using|trx\s?id|txn\s?id|trxid|txnid|ref|reference|balance|bal|avail\w*|fee|charge|vat|amount|is|was|has|your|account|a/c)\b|[,.;:]|$))`

function findPayee(text: string): string | null {
  const NAME = String.raw`[A-Za-z0-9&.'\-][A-Za-z0-9&.'\- ]{0,38}?`

  const patterns = [
    new RegExp(String.raw`\b(?:sender|receiver|merchant)\s*[:\-]\s*(01\d{9})\b`, 'i'),
    new RegExp(String.raw`\b(?:sender|receiver|merchant)\s*[:\-]\s*(${NAME})${STOP}`, 'i'),
    new RegExp(String.raw`\bused for\s+(?:bdt|tk|taka)?\s*[\d,.]*\s*(?:at|in)\s+(${NAME})${STOP}`, 'i'),
    new RegExp(String.raw`\b(?:to|from)\s+(01\d{9})\b`, 'i'),
    new RegExp(String.raw`\b(?:to|at|from|for)\s+(${NAME})${STOP}`, 'i'),
  ]

  for (const p of patterns) {
    const m = text.match(p)
    if (!m) continue
    const found = m[1].trim().replace(/\s{2,}/g, ' ').replace(/[.,;:\-]+$/, '')
    // "to your account" and friends are grammar, not a merchant.
    if (/^(your|the|a|an|account|acc|a\/c|bdt|tk|taka)\b/i.test(found)) continue
    if (found.length >= 2) return found
  }
  return null
}

export function parseSms(raw: string, decimalDigits = 2): ParsedSms {
  const text = normalize(raw)
  if (!text) {
    return {
      amountMinor: null, direction: null, payee: null,
      occurredOn: null, reference: null, balanceMinor: null, feeMinor: null,
    }
  }

  const lower = text.toLowerCase()
  const hits = findAmounts(text)
  const toMinor = (v: string | undefined) => (v ? parseAmount(v, decimalDigits) : null)

  const fee = hits.find((h) => h.label === 'fee' || h.label === 'charge' || h.label === 'vat')
  const balance = hits.find((h) => h.label === 'balance' || h.label === 'available' || h.label === 'bal' || h.label === 'avail bal')
  const amount = hits.find((h) => h.label === '') ?? hits[0]

  const creditAt = CREDIT_WORDS.map((w) => lower.indexOf(w)).filter((i) => i >= 0)
  const debitAt = DEBIT_WORDS.map((w) => lower.indexOf(w)).filter((i) => i >= 0)
  const firstCredit = creditAt.length ? Math.min(...creditAt) : Infinity
  const firstDebit = debitAt.length ? Math.min(...debitAt) : Infinity

  const direction =
    firstCredit === Infinity && firstDebit === Infinity ? null
    : firstCredit < firstDebit ? 'income' as const
    : 'expense' as const

  const reference = text.match(/\b(?:trx\s?id|txn\s?id|trxid|ref(?:erence)?(?:\s?no)?)\s*[:\-.]?\s*([A-Za-z0-9]{4,})/i)

  return {
    amountMinor: toMinor(amount?.value),
    direction,
    payee: findPayee(text),
    occurredOn: findDate(text),
    reference: reference ? reference[1] : null,
    balanceMinor: toMinor(balance?.value),
    feeMinor: toMinor(fee?.value),
  }
}
