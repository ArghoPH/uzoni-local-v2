import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const out = join(mkdtempSync(join(tmpdir(), 'uzoni-')), 'money.mjs')
await build({
  entryPoints: ['src/lib/money.ts'],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
})
const M = await import(pathToFileURL(out).href)

let failed = 0
const eq = (actual, expected, what) => {
  const ok = Object.is(actual, expected)
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what} -> ${actual}${ok ? '' : ` (expected ${expected})`}`)
}

const BDT = { code: 'BDT', name: 'Taka', symbol: '৳', decimal_digits: 2 }
const JPY = { code: 'JPY', name: 'Yen', symbol: '¥', decimal_digits: 0 }
const KWD = { code: 'KWD', name: 'Dinar', symbol: 'KD', decimal_digits: 3 }
const BDTX = { code: 'BDT', name: 'Taka', symbol: 'BDT', decimal_digits: 2 }

// --- parseAmount -----------------------------------------------------------
eq(M.parseAmount('1250.50', 2), 125050, 'plain decimal')
eq(M.parseAmount('1,250.50', 2), 125050, 'comma thousands + dot decimal')
eq(M.parseAmount('1.250,50', 2), 125050, 'dot thousands + comma decimal')
eq(M.parseAmount('1,250', 2), 125000, '1,250 is one thousand two fifty')
eq(M.parseAmount('1.250', 2), 125000, '1.250 is one thousand two fifty')
eq(M.parseAmount('1,25', 2), 125, '1,25 is one twenty-five')
eq(M.parseAmount('1.5', 2), 150, 'one decimal place')
eq(M.parseAmount('1,250,000', 2), 125000000, 'repeated thousands groups')
eq(M.parseAmount('0.005', 2), 1, 'rounds half up')
eq(M.parseAmount('0.004', 2), 0, 'rounds down')
eq(M.parseAmount('12.5k', 2), 1250000, 'k suffix')
eq(M.parseAmount('2l', 2), 20000000, 'lakh suffix')
eq(M.parseAmount('1c', 2), 1000000000, 'crore suffix')
eq(M.parseAmount('-40', 2), -4000, 'negative')
eq(M.parseAmount('৳ ১,২৫০.৫০', 2), 125050, 'Bengali digits with symbol')
eq(M.parseAmount('500', 0), 500, 'zero-decimal currency')
eq(M.parseAmount('1.234', 3), 1234, 'three-decimal currency')
eq(M.parseAmount('', 2), null, 'empty string')
eq(M.parseAmount('abc', 2), null, 'no digits')

// --- formatMoney -----------------------------------------------------------
eq(M.formatMoney(125050, BDT), '৳\u20091,250.50', 'format BDT')
eq(M.formatMoney(-125050, BDT), '-৳\u20091,250.50', 'format negative')
eq(M.formatMoney(125050, BDT, { signed: true }), '+৳\u20091,250.50', 'format signed positive')
eq(M.formatMoney(500, JPY), '¥500', 'format zero-decimal currency')
eq(M.formatMoney(1234, KWD), 'KD\u00A01.234', 'letter symbol gets a non-breaking space')
eq(M.formatMoney(500000, BDT, { compactZeros: true }), '৳\u20095,000', 'drop empty decimals')
eq(M.formatMoney(125050, BDT, { symbol: false }), '1,250.50', 'without symbol')
eq(M.formatMoney(400000, BDTX), 'BDT\u00A04,000.00', 'BDT written out as letters')
eq(M.formatMoney(-400000, BDTX), '-BDT\u00A04,000.00', 'sign stays in front of a letter symbol')
eq(M.formatMoney(125050, BDT), '\u09F3\u20091,250.50', 'taka sign gets a thin space')

// --- round trip ------------------------------------------------------------
for (const v of ['0.01', '99999.99', '7', '1,00,000.5']) {
  const minor = M.parseAmount(v, 2)
  eq(M.parseAmount(M.formatMoney(minor, BDT, { symbol: false }), 2), minor, `round trip ${v}`)
}

// --- signedAmount ----------------------------------------------------------
const transfer = { type: 'transfer', amount_minor: 10000, transfer_amount_minor: 1225000, account_id: 'A', transfer_account_id: 'B' }
eq(M.signedAmount(transfer, 'A'), -10000, 'transfer leaves the source')
eq(M.signedAmount(transfer, 'B'), 1225000, 'transfer arrives at the destination in its own currency')
eq(M.signedAmount({ type: 'expense', amount_minor: 500, transfer_amount_minor: null, account_id: 'A', transfer_account_id: null }), -500, 'expense is negative')

console.log(failed === 0 ? '\n===== money.ts: all checks passed =====' : `\n===== ${failed} FAILED =====`)
process.exit(failed === 0 ? 0 : 1)
