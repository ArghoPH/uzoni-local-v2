/**
 * Checks the insights endpoint against a database seeded with two comparable
 * periods, so the comparison maths is verified rather than assumed.
 *   BASE=http://127.0.0.1:5199 node scripts/insights.test.mjs
 */
const BASE = process.env.BASE ?? 'http://127.0.0.1:5199'

let failed = 0
const check = (ok, what, extra = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok ? '' : `  ${extra}`}`)
}

const call = async (method, path, body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

const iso = (d) => d.toISOString().slice(0, 10)
const daysAgo = (n) => iso(new Date(Date.now() - n * 86400000))
const today = iso(new Date())

// ------------------------------------------------------------------ setup --
const acc = (await call('POST', '/api/accounts', {
  name: 'Insights Cash', type: 'cash', currency_code: 'BDT', initial_balance_minor: 5000000,
})).body
check(Boolean(acc.id), 'account created')

const cats = (await call('GET', '/api/categories')).body
const catId = (name) => cats.find((c) => c.name === name)?.id

const add = (amount, on, category, payee, type = 'expense') =>
  call('POST', '/api/transactions', {
    type, account_id: acc.id, category_id: category ? catId(category) : null,
    amount_minor: amount, currency_code: 'BDT', occurred_on: on, payee,
  })

// current window: the last 10 days
await add(300000, daysAgo(1), 'Groceries', 'Shwapno')
await add(200000, daysAgo(3), 'Groceries', 'Shwapno')
await add(150000, daysAgo(2), 'Restaurant', "Sultan's Dine")
await add(50000,  daysAgo(4), 'Ride hailing', 'Uber')
await add(6000000, daysAgo(5), 'Monthly salary', 'Employer', 'income')

// previous window: the 10 days before that
await add(100000, daysAgo(12), 'Groceries', 'Meena Bazar')
await add(250000, daysAgo(14), 'Restaurant', 'KFC')
await add(1000000, daysAgo(15), 'Bonus', 'Employer', 'income')

// ----------------------------------------------------------------- checks --
const from = daysAgo(9)
const r = await call('GET', `/api/reports/insights?from=${from}&to=${today}&currency=BDT`)
check(r.status === 200, 'insights responds', JSON.stringify(r.body).slice(0, 120))
const d = r.body

check(d.range.days === 10, 'range spans ten days', d.range.days)
check(d.previous_range.to === daysAgo(10), 'previous period ends the day before the range', d.previous_range.to)
check(d.previous_range.from === daysAgo(19), 'previous period is the same length', d.previous_range.from)

check(d.totals.expense_minor === 700000, 'spend in this period', d.totals.expense_minor)
check(d.totals.income_minor === 6000000, 'income in this period', d.totals.income_minor)
check(d.totals.net_minor === 5300000, 'net is income minus expense', d.totals.net_minor)
check(d.previous_totals.expense_minor === 350000, 'spend in the previous period', d.previous_totals.expense_minor)
check(d.previous_totals.income_minor === 1000000, 'income in the previous period', d.previous_totals.income_minor)

const food = d.categories.find((c) => c.category_name === 'Food & Drinks')
check(food?.total_minor === 650000, 'child categories roll up to the parent', food?.total_minor)
check(food?.prev_total_minor === 350000, 'each category carries its previous total', food?.prev_total_minor)
check(d.categories[0].total_minor >= d.categories[d.categories.length - 1].total_minor,
  'categories come back ranked')

const transport = d.categories.find((c) => c.category_name === 'Transport')
check(transport?.prev_total_minor === 0, 'a category with no history shows zero, not null', transport?.prev_total_minor)

check(d.top_payees[0]?.payee === 'Shwapno', 'top payee is the one with the largest total', d.top_payees[0]?.payee)
check(d.top_payees[0]?.total_minor === 500000, 'payee totals add up across transactions', d.top_payees[0]?.total_minor)
check(d.top_payees[0]?.txn_count === 2, 'payee visit count', d.top_payees[0]?.txn_count)
check(!d.top_payees.some((p) => p.payee === 'Employer'), 'income is left out of payee spending')

check(d.biggest_expenses[0]?.amount_minor === 300000, 'biggest single expense first', d.biggest_expenses[0]?.amount_minor)
check(d.biggest_expenses[0]?.category_name === 'Food & Drinks › Groceries',
  'biggest expense shows its full category path', d.biggest_expenses[0]?.category_name)

check(d.pace.days_elapsed === 10, 'a range ending today is fully elapsed', d.pace.days_elapsed)
check(d.pace.avg_per_day_minor === 70000, 'average spend per day', d.pace.avg_per_day_minor)
check(d.pace.is_partial === false, 'a finished range is not projected')
check(d.missing_rate === false, 'no missing exchange rate in a single-currency ledger')

// a range running past today should project rather than report
const future = await call('GET',
  `/api/reports/insights?from=${from}&to=${iso(new Date(Date.now() + 5 * 86400000))}&currency=BDT`)
check(future.body.pace.is_partial === true, 'a range ending in the future is marked partial')
check(future.body.pace.projected_expense_minor > future.body.totals.expense_minor,
  'the projection runs ahead of what has been spent so far',
  `${future.body.pace.projected_expense_minor} vs ${future.body.totals.expense_minor}`)

console.log(failed === 0 ? '\n=====  insights: all checks passed  =====' : `\n=====  ${failed} FAILED  =====`)
process.exit(failed === 0 ? 0 : 1)
