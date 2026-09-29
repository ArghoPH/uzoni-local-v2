/**
 * End-to-end checks for the advice features against a seeded database:
 * forecast and safe-to-spend, budget suggestions, subscription and price-creep
 * detection, unusual expenses, category trends, payee memory, the
 * uncategorized inbox, budget rollover and reconcile.
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
const get = (p) => call('GET', p)
const post = (p, b) => call('POST', p, b)

const pad = (n) => String(n).padStart(2, '0')
const localIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const today = localIso(new Date())
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return localIso(d) }
const daysAhead = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return localIso(d) }
const monthsAgoStart = (n) => {
  const d = new Date(); return localIso(new Date(d.getFullYear(), d.getMonth() - n, 5))
}
const startOfMonth = () => { const d = new Date(); return localIso(new Date(d.getFullYear(), d.getMonth(), 1)) }

// ------------------------------------------------------------------ setup --
const acc = (await post('/api/accounts', {
  name: 'Advisor Cash', type: 'cash', currency_code: 'BDT', initial_balance_minor: 5000000,
})).body
check(Boolean(acc.id), 'account created')

const cats = (await get('/api/categories')).body
const catId = (n) => cats.find((c) => c.name === n)?.id

const add = (amount, on, category, payee, type = 'expense') =>
  post('/api/transactions', {
    type, account_id: acc.id, category_id: category ? catId(category) : null,
    amount_minor: amount, currency_code: 'BDT', occurred_on: on, payee,
  })

// Three full months of groceries, so a budget can be suggested from history.
for (const [n, amount] of [[3, 800000], [2, 900000], [1, 700000]]) {
  await add(amount, monthsAgoStart(n), 'Groceries', 'Shwapno')
}

// A monthly subscription whose price crept up on the last charge.
await add(50000, daysAgo(93), 'Streaming', 'Netflix')
await add(50000, daysAgo(62), 'Streaming', 'Netflix')
await add(50000, daysAgo(31), 'Streaming', 'Netflix')
await add(60000, daysAgo(1), 'Streaming', 'Netflix')

// Ordinary restaurant spending, then one outlier far above it.
for (const d of [20, 17, 14, 11, 8]) await add(40000, daysAgo(d), 'Restaurant', 'Local place')
await add(500000, daysAgo(2), 'Restaurant', 'Anniversary dinner')

// Something never filed.
await add(12000, daysAgo(4), null, 'Unknown shop')

// --------------------------------------------------------------- forecast --
{
  const r = await get('/api/advisor/forecast?currency=BDT&days=45')
  check(r.status === 200, 'forecast responds')
  const f = r.body
  check(f.as_of === today, 'forecast is dated today in local time, not UTC', f.as_of)
  check(f.series.length === 46, 'forecast covers the whole horizon', f.series.length)
  check(f.series[0].date === today, 'the series starts today', f.series[0].date)
  check(f.daily_burn_minor > 0, 'a daily burn rate is derived from real spending', f.daily_burn_minor)
  check(f.safe_per_day_minor >= 0, 'safe-to-spend is never negative', f.safe_per_day_minor)
  check(f.balance_minor === f.available_minor + f.committed_minor + f.reserved_minor,
    'balance splits into available, committed and reserved',
    `${f.balance_minor} vs ${f.available_minor}+${f.committed_minor}+${f.reserved_minor}`)
}

// a planned payment should become committed money and appear in the forecast
{
  await post('/api/recurring', {
    name: 'Rent', type: 'expense', account_id: acc.id, category_id: catId('Rent'),
    amount_minor: 1500000, currency_code: 'BDT', freq: 'monthly', interval_count: 1,
    starts_on: daysAhead(3), next_occurrence_on: daysAhead(3), auto_create: false,
  })
  const f = (await get('/api/advisor/forecast?currency=BDT&days=45')).body
  check(f.committed_minor >= 1500000 || f.upcoming.some((u) => u.name === 'Rent'),
    'a planned payment shows up as committed or upcoming',
    `committed ${f.committed_minor}, upcoming ${f.upcoming.length}`)
  check(f.upcoming.some((u) => u.name === 'Rent'), 'the rent is listed in upcoming')
}

// -------------------------------------------------------------- suggestions --
{
  const r = await get('/api/advisor/budget-suggestions?currency=BDT')
  check(r.status === 200, 'budget suggestions respond')
  const food = r.body.find((b) => b.category_name === 'Food & Drinks')
  check(Boolean(food), 'the biggest spending category is suggested', JSON.stringify(r.body).slice(0, 120))
  if (food) {
    check(food.months_observed >= 2, 'suggestion uses more than one month', food.months_observed)
    check(food.suggested_minor >= food.average_minor,
      'the suggestion sits at or above the average', `${food.suggested_minor} vs ${food.average_minor}`)
    check(food.suggested_minor % 50000 === 0, 'the suggestion is a round number', food.suggested_minor)
  }
}

// ------------------------------------------------------------ subscriptions --
{
  const r = await get('/api/advisor/subscriptions?currency=BDT')
  check(r.status === 200, 'subscriptions respond')
  const netflix = r.body.find((s) => s.payee === 'Netflix')
  check(Boolean(netflix), 'a monthly repeat is detected as a subscription',
    JSON.stringify(r.body).slice(0, 160))
  if (netflix) {
    check(netflix.cadence === 'monthly', 'cadence read as monthly', netflix.cadence)
    check(netflix.occurrences === 4, 'all four charges counted', netflix.occurrences)
    check(netflix.price_crept === true, 'the price rise is flagged', netflix.price_change_pct)
    check(netflix.yearly_cost_minor > netflix.typical_amount_minor,
      'a yearly cost is projected', netflix.yearly_cost_minor)
  }
  check(!r.body.some((s) => s.payee === 'Shwapno'),
    'three charges months apart at different amounts are not called a subscription')
}

// ----------------------------------------------------------------- unusual --
{
  const r = await get(`/api/advisor/unusual?from=${daysAgo(30)}&to=${today}&currency=BDT`)
  check(r.status === 200, 'unusual responds')
  const dinner = r.body.find((u) => u.payee === 'Anniversary dinner')
  check(Boolean(dinner), 'a spike far above the category median is caught',
    JSON.stringify(r.body).slice(0, 160))
  if (dinner) check(dinner.times_typical >= 2.5, 'how far above typical is reported', dinner.times_typical)
  check(!r.body.some((u) => u.payee === 'Local place'), 'ordinary spending is left alone')
}

// ------------------------------------------------------------------ trends --
{
  const r = await get('/api/advisor/trends?currency=BDT&months=6')
  check(r.status === 200, 'trends respond')
  check(r.body.length > 0, 'trends come back with categories', r.body.length)
  const first = r.body[0]
  check(first.series.length === 6, 'each category has one point per month', first.series?.length)
  check(['rising', 'falling', 'steady'].includes(first.direction), 'a direction is assigned', first.direction)
}

// ------------------------------------------------------- payees and inbox --
{
  const r = await get('/api/payees/suggest?q=shw')
  check(r.body[0]?.payee === 'Shwapno', 'payee search matches on a prefix', JSON.stringify(r.body))
  check(Boolean(r.body[0]?.category_id), 'the payee remembers its category')
  check(r.body[0]?.amount_minor > 0, 'the payee remembers its last amount')

  const u = (await get('/api/advisor/uncategorized')).body
  check(u.count === 1, 'the uncategorized inbox counts what is unfiled', u.count)
  check(u.amount_minor === 12000, 'and what it is worth', u.amount_minor)

  const filtered = (await get(`/api/transactions?from=${daysAgo(60)}&to=${today}&uncategorized=1`)).body
  check(filtered.length === 1, 'the transaction list can show only unfiled rows', filtered.length)
}

// ---------------------------------------------------------------- rollover --
{
  const b = (await post('/api/budgets', {
    name: 'Rollover food', amount_minor: 1000000, currency_code: 'BDT',
    period: 'monthly', starts_on: monthsAgoStart(3), rollover: true,
    categoryIds: [catId('Food & Drinks')],
  })).body
  check(Boolean(b.id), 'rollover budget created')

  const progress = (await get(`/api/budgets/progress?ref=${today}`)).body
  const row = progress.find((p) => p.budget_id === b.id)
  check(Boolean(row), 'the rollover budget appears in progress')
  // months -3, -2, -1 spent 8000, 9000, 7000 of 10000 -> +2000 + 1000 + 3000
  check(row?.rollover_minor === 600000,
    'unspent money from earlier months is carried forward', row?.rollover_minor)

  const plain = (await post('/api/budgets', {
    name: 'No rollover', amount_minor: 1000000, currency_code: 'BDT',
    period: 'monthly', starts_on: monthsAgoStart(3), rollover: false,
  })).body
  const plainRow = (await get(`/api/budgets/progress?ref=${today}`)).body
    .find((p) => p.budget_id === plain.id)
  check(plainRow?.rollover_minor === 0, 'a budget without rollover carries nothing', plainRow?.rollover_minor)
}

// --------------------------------------------------------------- reconcile --
{
  const before = (await get('/api/accounts')).body.find((a) => a.id === acc.id)
  const target = before.balance.balance_minor - 25000

  const r = await post(`/api/accounts/${acc.id}/reconcile`, {
    actual_balance_minor: target, occurred_on: today, note: 'Counted the wallet',
  })
  check(r.body.adjusted === true, 'reconcile writes an adjustment')
  check(r.body.difference_minor === -25000, 'the shortfall is measured', r.body.difference_minor)
  check(r.body.transaction?.type === 'expense', 'being short records an expense', r.body.transaction?.type)

  const after = (await get('/api/accounts')).body.find((a) => a.id === acc.id)
  check(after.balance.balance_minor === target, 'the balance now matches what was counted',
    `${after.balance.balance_minor} vs ${target}`)

  const again = await post(`/api/accounts/${acc.id}/reconcile`, { actual_balance_minor: target })
  check(again.body.adjusted === false, 'reconciling an already-correct balance changes nothing')
}

console.log(failed === 0 ? '\n=====  advisor: all checks passed  =====' : `\n=====  ${failed} FAILED  =====`)
process.exit(failed === 0 ? 0 : 1)
