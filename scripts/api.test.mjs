/**
 * End-to-end check of the local API: starts nothing, assumes the server is
 * already listening, then exercises every route against a real database.
 *   DATABASE_URL=... node server/index.js &
 *   BASE=http://127.0.0.1:5174 node scripts/api.test.mjs
 */
const BASE = process.env.BASE ?? 'http://127.0.0.1:5174'

let failed = 0
const check = (ok, what, extra = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok ? '' : `  ${extra}`}`)
}

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = { raw: text } }
  return { status: res.status, body: json }
}
const get = (p) => call('GET', p)
const post = (p, b) => call('POST', p, b)
const patch = (p, b) => call('PATCH', p, b)
const del = (p) => call('DELETE', p)

const today = new Date().toISOString().slice(0, 10)
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

// ---------------------------------------------------------------- health --
{
  const r = await get('/api/health')
  check(r.status === 200 && r.body.database === 'up', 'health check reaches the database')
}

// ------------------------------------------------------------ reference --
{
  const r = await get('/api/currencies')
  check(r.status === 200 && r.body.length === 39, 'currencies load', `got ${r.body?.length}`)

  const s = await get('/api/settings')
  check(s.status === 200 && s.body.id === 1, 'settings row exists')

  const u = await patch('/api/settings', { display_name: 'Rafi', base_currency: 'BDT' })
  check(u.body.display_name === 'Rafi', 'settings update')

  const c = await get('/api/categories')
  check(c.body.length > 50, 'default categories seeded', `got ${c.body?.length}`)
}

// -------------------------------------------------------------- accounts --
const accounts = {}
for (const [key, name, type, cur, opening] of [
  ['cash', 'Cash', 'cash', 'BDT', 500000],
  ['savings', 'DBBL Savings', 'savings', 'BDT', 12500000],
  ['bkash', 'bKash', 'mobile_wallet', 'BDT', 230050],
  ['payoneer', 'Payoneer', 'current', 'USD', 40000],
]) {
  const r = await post('/api/accounts', {
    name, type, currency_code: cur, initial_balance_minor: opening, color: '#3b45d6',
  })
  accounts[key] = r.body?.id
  check(r.status === 201 && r.body.id, `create account ${name}`, JSON.stringify(r.body))
}
{
  const dup = await post('/api/accounts', { name: 'Cash', type: 'cash', currency_code: 'BDT' })
  check(dup.status === 409 && dup.body.error.code === '23505', 'duplicate account name rejected')
}

// ------------------------------------------------------------------- fx --
{
  const r = await post('/api/rates', { base_code: 'USD', quote_code: 'BDT', rate: 122.5, as_of: daysAgo(30) })
  check(r.status === 200 && Number(r.body.rate) === 122.5, 'exchange rate saved')
}

// --------------------------------------------------------- transactions --
const cats = (await get('/api/categories')).body
const catId = (name) => cats.find((c) => c.name === name)?.id

{
  const e = await post('/api/transactions', {
    type: 'expense', account_id: accounts.cash, category_id: catId('Groceries'),
    amount_minor: 125050, currency_code: 'BDT', occurred_on: daysAgo(3), payee: 'Shwapno',
  })
  check(e.status === 201, 'create expense', JSON.stringify(e.body))

  const i = await post('/api/transactions', {
    type: 'income', account_id: accounts.savings, category_id: catId('Monthly salary'),
    amount_minor: 6500000, currency_code: 'BDT', occurred_on: daysAgo(10), payee: 'Employer',
  })
  check(i.status === 201, 'create income')

  const t = await post('/api/transactions', {
    type: 'transfer', account_id: accounts.savings, transfer_account_id: accounts.bkash,
    amount_minor: 1000000, currency_code: 'BDT', occurred_on: daysAgo(2),
  })
  check(t.status === 201, 'create same-currency transfer')

  const fx = await post('/api/transactions', {
    type: 'transfer', account_id: accounts.payoneer, transfer_account_id: accounts.savings,
    amount_minor: 10000, transfer_amount_minor: 1225000, currency_code: 'USD', occurred_on: daysAgo(1),
  })
  check(fx.status === 201, 'create cross-currency transfer', JSON.stringify(fx.body))
}

// ------------------------------------------------------------ guard rails --
{
  const neg = await post('/api/transactions', {
    type: 'expense', account_id: accounts.cash, amount_minor: -500,
    currency_code: 'BDT', occurred_on: today,
  })
  check(neg.status === 400, 'negative amount rejected', `status ${neg.status}`)

  const same = await post('/api/transactions', {
    type: 'transfer', account_id: accounts.cash, transfer_account_id: accounts.cash,
    amount_minor: 100, currency_code: 'BDT', occurred_on: today,
  })
  check(same.status === 400, 'transfer to the same account rejected')

  const noFx = await post('/api/transactions', {
    type: 'transfer', account_id: accounts.payoneer, transfer_account_id: accounts.savings,
    amount_minor: 100, currency_code: 'USD', occurred_on: today,
  })
  check(noFx.status === 400 && /transfer_amount_minor/.test(noFx.body.error.message),
    'cross-currency transfer without a destination amount rejected')

  const wrongCur = await post('/api/transactions', {
    type: 'expense', account_id: accounts.cash, amount_minor: 100,
    currency_code: 'USD', occurred_on: today,
  })
  check(wrongCur.status === 400, 'currency that disagrees with the account rejected')

  const wrongKind = await post('/api/transactions', {
    type: 'expense', account_id: accounts.cash, category_id: catId('Salary'),
    amount_minor: 100, currency_code: 'BDT', occurred_on: today,
  })
  check(wrongKind.status === 400, 'income category on an expense rejected')
}

// -------------------------------------------------------------- balances --
{
  const list = (await get('/api/accounts')).body
  const bal = (id) => list.find((a) => a.id === id).balance.balance_minor
  check(bal(accounts.cash) === 374950, 'cash balance', bal(accounts.cash))
  check(bal(accounts.savings) === 19225000, 'savings balance after income, transfer out, fx in', bal(accounts.savings))
  check(bal(accounts.bkash) === 1230050, 'bkash balance after transfer in', bal(accounts.bkash))
  check(bal(accounts.payoneer) === 30000, 'payoneer balance after fx transfer out', bal(accounts.payoneer))
}

// ----------------------------------------------------------- list/filter --
{
  const all = (await get(`/api/transactions?from=${daysAgo(40)}&to=${today}&limit=50`)).body
  check(all.length === 4, 'transaction list', `got ${all.length}`)
  check(all[0].account && all[0].account.name, 'rows embed their account')

  const onlyExpense = (await get(`/api/transactions?types=expense&from=${daysAgo(40)}&to=${today}`)).body
  check(onlyExpense.length === 1, 'filter by type')

  const search = (await get(`/api/transactions?search=Shwapno&from=${daysAgo(40)}&to=${today}`)).body
  check(search.length === 1, 'search by payee')

  const byAccount = (await get(`/api/transactions?accountIds=${accounts.bkash}&from=${daysAgo(40)}&to=${today}`)).body
  check(byAccount.length === 1, 'account filter includes the receiving side of a transfer')
}

// --------------------------------------------------------------- reports --
{
  const totals = (await get(`/api/reports/category-totals?from=${daysAgo(40)}&to=${today}&currency=BDT&kind=expense`)).body
  const food = totals.find((t) => t.category_name === 'Food & Drinks')
  check(food?.total_minor === 125050, 'child spend rolls up to the parent category', food?.total_minor)

  const flow = (await get(`/api/reports/cashflow?from=${daysAgo(40)}&to=${today}&currency=BDT&bucket=month`)).body
  check(Array.isArray(flow) && flow.length >= 1, 'cashflow series returns buckets')

  const nw = (await get(`/api/reports/net-worth?currency=BDT&asOf=${today}`)).body
  check(nw.net_minor === 24505000, 'net worth converts USD into BDT', nw.net_minor)
}

// --------------------------------------------------------------- budgets --
{
  const b = await post('/api/budgets', {
    name: 'Monthly food', amount_minor: 800000, currency_code: 'BDT',
    period: 'monthly', starts_on: daysAgo(3).slice(0, 8) + '01',
    categoryIds: [catId('Food & Drinks')],
  })
  check(b.status === 201, 'create budget with scope', JSON.stringify(b.body))

  const scope = (await get(`/api/budgets/${b.body.id}/scope`)).body
  check(scope.categoryIds.length === 1, 'budget scope saved')

  const prog = (await get(`/api/budgets/progress?ref=${daysAgo(3)}`)).body
  check(prog[0]?.spent_minor === 125050, 'budget picks up spend in a child category', prog[0]?.spent_minor)

  const upd = await patch(`/api/budgets/${b.body.id}`, { amount_minor: 900000, categoryIds: [] })
  check(upd.body.amount_minor === 900000, 'budget update')
  check((await get(`/api/budgets/${b.body.id}/scope`)).body.categoryIds.length === 0, 'budget scope cleared')
}

// ----------------------------------------------------------------- goals --
{
  const g = await post('/api/goals', { name: 'Laptop', target_minor: 15000000, currency_code: 'BDT' })
  check(g.status === 201, 'create goal')
  await post(`/api/goals/${g.body.id}/contributions`, { amount_minor: 2000000, occurred_on: today })
  await post(`/api/goals/${g.body.id}/contributions`, { amount_minor: -500000, occurred_on: today })
  const goals = (await get('/api/goals')).body
  check(goals[0].saved_minor === 1500000, 'contributions and withdrawals net out', goals[0].saved_minor)
}

// ----------------------------------------------------------------- debts --
{
  const d = await post('/api/debts', {
    kind: 'lent', person_name: 'Tanvir', amount_minor: 500000,
    currency_code: 'BDT', occurred_on: today,
  })
  check(d.status === 201, 'create debt')
  await post(`/api/debts/${d.body.id}/payments`, { amount_minor: 200000, occurred_on: today })
  const debts = (await get('/api/debts')).body
  check(debts[0].remaining_minor === 300000, 'debt remaining after a part payment', debts[0].remaining_minor)
}

// ------------------------------------------------------------- recurring --
{
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const start = threeMonthsAgo.toISOString().slice(0, 10)

  const r = await post('/api/recurring', {
    name: 'Internet bill', type: 'expense', account_id: accounts.cash,
    category_id: catId('Internet'), amount_minor: 120000, currency_code: 'BDT',
    freq: 'monthly', interval_count: 1, starts_on: start, next_occurrence_on: start,
    auto_create: true,
  })
  check(r.status === 201, 'create recurring rule', JSON.stringify(r.body))

  const gen = await post('/api/recurring/generate', { through: today })
  check(gen.body.created === 4, 'four monthly bills posted for a three-month backlog', gen.body.created)

  const again = await post('/api/recurring/generate', { through: today })
  check(again.body.created === 0, 'second run is idempotent', again.body.created)
}

// ----------------------------------------------------------------- bulk --
{
  const rows = (await get(`/api/transactions?from=${daysAgo(120)}&to=${today}&types=expense`)).body
  const ids = rows.slice(0, 2).map((r) => r.id)
  const rc = await post('/api/transactions/bulk-category', { ids, category_id: catId('Fast food') })
  check(rc.status === 200, 'bulk recategorize')

  const bd = await post('/api/transactions/bulk-delete', { ids })
  check(bd.status === 200, 'bulk delete')

  const left = (await get(`/api/transactions?from=${daysAgo(120)}&to=${today}&types=expense`)).body
  check(left.length === rows.length - 2, 'rows really went away', `${left.length} of ${rows.length}`)
}

// -------------------------------------------------------------- cleanup --
{
  const d = await del(`/api/accounts/${accounts.payoneer}`)
  check(d.status === 200, 'delete account')
  const list = (await get('/api/accounts')).body
  check(!list.some((a) => a.id === accounts.payoneer), 'account gone from the list')
}

console.log(failed === 0 ? '\n=====  API: all checks passed  =====' : `\n=====  ${failed} FAILED  =====`)
process.exit(failed === 0 ? 0 : 1)
