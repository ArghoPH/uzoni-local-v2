import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const out = join(mkdtempSync(join(tmpdir(), 'uzoni-')), 'sms.mjs')
await build({ entryPoints: ['src/lib/smsParse.ts'], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' })
const { parseSms } = await import(pathToFileURL(out).href)

let failed = 0
const eq = (a, e, what) => {
  const ok = Object.is(a, e)
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what} -> ${JSON.stringify(a)}${ok ? '' : ` (expected ${JSON.stringify(e)})`}`)
}

// --- bKash ------------------------------------------------------------------
{
  const r = parseSms("You have received Tk 1,000.00 from 01712345678. Fee Tk 0.00. Balance Tk 5,250.50. TrxID AB12CD34 at 12/09/2026 14:05")
  eq(r.amountMinor, 100000, 'bKash received: amount, not the balance')
  eq(r.direction, 'income', 'bKash received: direction')
  eq(r.balanceMinor, 525050, 'bKash received: balance kept separately')
  eq(r.feeMinor, 0, 'bKash received: fee kept separately')
  eq(r.reference, 'AB12CD34', 'bKash received: TrxID')
  eq(r.occurredOn, '2026-09-12', 'bKash received: date')
  eq(r.payee, '01712345678', 'bKash received: sender number as payee')
}
{
  const r = parseSms("Cash Out Tk 2,500.00 to 01812345678 successful. Fee Tk 46.25. Balance Tk 1,200.75. TrxID XY99ZZ00 at 03/09/2026 09:12")
  eq(r.amountMinor, 250000, 'bKash cash out: amount')
  eq(r.direction, 'expense', 'bKash cash out: direction')
  eq(r.feeMinor, 4625, 'bKash cash out: fee')
  eq(r.balanceMinor, 120075, 'bKash cash out: balance')
}
{
  const r = parseSms("Payment Tk 349.00 to Shwapno successful. Balance Tk 8,100.00. TrxID QQ11WW22 at 28/09/2026 19:40")
  eq(r.amountMinor, 34900, 'bKash payment: amount')
  eq(r.payee, 'Shwapno', 'bKash payment: merchant')
  eq(r.direction, 'expense', 'bKash payment: direction')
}

// --- Nagad ------------------------------------------------------------------
{
  const r = parseSms("Money Received. Amount: Tk 750.50 Sender: 01911111111 TxnID: NGD7788 Balance: Tk 3,000.00 25-Sep-26")
  eq(r.amountMinor, 75050, 'Nagad received: amount')
  eq(r.direction, 'income', 'Nagad received: direction')
  eq(r.payee, '01911111111', 'Nagad received: sender')
  eq(r.reference, 'NGD7788', 'Nagad received: TxnID')
  eq(r.occurredOn, '2026-09-25', 'Nagad received: named-month date')
}

// --- banks ------------------------------------------------------------------
{
  const r = parseSms("Dear Customer, your A/C ****1234 is debited by BDT 1,500.00 on 05-Sep-2026. Available Balance BDT 42,300.00")
  eq(r.amountMinor, 150000, 'bank debit: amount, not the balance')
  eq(r.direction, 'expense', 'bank debit: direction')
  eq(r.balanceMinor, 4230000, 'bank debit: balance')
  eq(r.occurredOn, '2026-09-05', 'bank debit: date')
  eq(r.payee, null, 'bank debit: no merchant to find')
}
{
  const r = parseSms("Your A/C ***9876 is credited by BDT 65,000.00 on 2026-09-01. Balance BDT 71,450.25")
  eq(r.amountMinor, 6500000, 'bank credit: amount')
  eq(r.direction, 'income', 'bank credit: direction')
  eq(r.occurredOn, '2026-09-01', 'bank credit: ISO date')
}
{
  const r = parseSms("Your card ending 4321 has been used for BDT 2,750.00 at AGORA GULSHAN on 20/09/2026")
  eq(r.amountMinor, 275000, 'card purchase: amount')
  eq(r.direction, 'expense', 'card purchase: direction')
  eq(r.payee, 'AGORA GULSHAN', 'card purchase: merchant')
}

// --- awkward input ----------------------------------------------------------
{
  const r = parseSms("")
  eq(r.amountMinor, null, 'empty message')
  eq(r.direction, null, 'empty message has no direction')
}
{
  const r = parseSms("Hello, your OTP is 123456. Do not share it.")
  eq(r.amountMinor, null, 'a message with no money in it')
}
{
  const r = parseSms("আপনি Tk ১,২৫০.৫০ পেয়েছেন। Balance Tk ৫,০০০.০০")
  eq(r.amountMinor, 125050, 'Bengali digits')
}
{
  const r = parseSms("Received BDT 500 from 01700000000")
  eq(r.amountMinor, 50000, 'amount with no decimals')
  eq(r.balanceMinor, null, 'no balance in the message')
}

console.log(failed === 0 ? '\n===== smsParse: all checks passed =====' : `\n===== ${failed} FAILED =====`)
process.exit(failed === 0 ? 0 : 1)
