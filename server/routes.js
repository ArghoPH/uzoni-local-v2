import { Router } from 'express'
import { buildInsert, buildUpdate, one, query, tx } from './db.js'
import { today } from './dates.js'
import { insights } from './insights.js'
import {
  budgetSuggestions, categoryTrends, forecast, payeeSuggestions,
  reconcile, subscriptions, uncategorized, unusualExpenses,
} from './advisor.js'

export const api = Router()

/** Wraps an async handler so a rejected promise reaches the error middleware. */
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next)

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : String(v).split(',').filter(Boolean))

/* ------------------------------------------------------------- reference -- */

api.get('/currencies', h(async (_req, res) => {
  res.json(await query('select * from currencies order by code'))
}))

api.get('/settings', h(async (_req, res) => {
  let row = await one('select * from settings where id = 1')
  if (!row) row = await one('insert into settings (id) values (1) returning *')
  res.json(row)
}))

const SETTINGS_FIELDS = [
  'display_name', 'base_currency', 'locale', 'week_starts_on',
  'month_starts_on', 'theme', 'onboarded_at',
]

api.patch('/settings', h(async (req, res) => {
  const { clause, values } = buildUpdate(req.body, SETTINGS_FIELDS)
  if (!clause) return res.json(await one('select * from settings where id = 1'))
  res.json(await one(`update settings set ${clause} where id = 1 returning *`, values))
}))

api.get('/rates', h(async (_req, res) => {
  res.json(await query('select * from exchange_rates order by as_of desc, base_code'))
}))

api.post('/rates', h(async (req, res) => {
  const { base_code, quote_code, rate, as_of } = req.body
  res.json(await one(
    `insert into exchange_rates (base_code, quote_code, rate, as_of)
     values ($1, $2, $3, $4)
     on conflict (base_code, quote_code, as_of) do update set rate = excluded.rate
     returning *`,
    [base_code, quote_code, rate, as_of],
  ))
}))

api.delete('/rates/:id', h(async (req, res) => {
  await query('delete from exchange_rates where id = $1', [req.params.id])
  res.json({ ok: true })
}))

/* -------------------------------------------------------------- accounts -- */

const ACCOUNT_FIELDS = [
  'name', 'type', 'currency_code', 'initial_balance_minor', 'credit_limit_minor',
  'color', 'icon', 'note', 'exclude_from_stats', 'archived', 'position',
]

api.get('/accounts', h(async (req, res) => {
  const includeArchived = req.query.archived === '1'
  const rows = await query(
    `select a.*,
            to_jsonb(b) - 'account_id' - 'currency_code' - 'initial_balance_minor'
              || jsonb_build_object('account_id', b.account_id,
                                    'currency_code', b.currency_code,
                                    'initial_balance_minor', b.initial_balance_minor) as balance
       from accounts a
       join account_balances b on b.account_id = a.id
      where ($1::boolean or a.archived = false)
      order by a.position, a.created_at`,
    [includeArchived],
  )
  res.json(rows)
}))

api.post('/accounts', h(async (req, res) => {
  const { cols, params, values } = buildInsert(req.body, ACCOUNT_FIELDS)
  res.status(201).json(await one(`insert into accounts (${cols}) values (${params}) returning *`, values))
}))

api.patch('/accounts/:id', h(async (req, res) => {
  const { clause, values, next } = buildUpdate(req.body, ACCOUNT_FIELDS)
  if (!clause) return res.json(await one('select * from accounts where id = $1', [req.params.id]))
  res.json(await one(
    `update accounts set ${clause} where id = $${next} returning *`,
    [...values, req.params.id],
  ))
}))

api.delete('/accounts/:id', h(async (req, res) => {
  await query('delete from accounts where id = $1', [req.params.id])
  res.json({ ok: true })
}))

/* ------------------------------------------------------------ categories -- */

const CATEGORY_FIELDS = ['parent_id', 'name', 'kind', 'color', 'icon', 'archived', 'position']

api.get('/categories', h(async (_req, res) => {
  res.json(await query('select * from categories order by position, name'))
}))

api.post('/categories', h(async (req, res) => {
  const { cols, params, values } = buildInsert(req.body, CATEGORY_FIELDS)
  res.status(201).json(await one(`insert into categories (${cols}) values (${params}) returning *`, values))
}))

api.patch('/categories/:id', h(async (req, res) => {
  const { clause, values, next } = buildUpdate(req.body, CATEGORY_FIELDS)
  if (!clause) return res.json(await one('select * from categories where id = $1', [req.params.id]))
  res.json(await one(
    `update categories set ${clause} where id = $${next} returning *`,
    [...values, req.params.id],
  ))
}))

api.delete('/categories/:id', h(async (req, res) => {
  await query('delete from categories where id = $1', [req.params.id])
  res.json({ ok: true })
}))

/* ---------------------------------------------------------- transactions -- */

const TXN_FIELDS = [
  'type', 'account_id', 'transfer_account_id', 'category_id', 'amount_minor',
  'transfer_amount_minor', 'currency_code', 'occurred_on', 'payee', 'note',
  'status', 'attachment_path', 'import_hash',
]

const TXN_SELECT = `
  select t.*,
         case when a.id is null then null else jsonb_build_object(
           'id', a.id, 'name', a.name, 'color', a.color,
           'icon', a.icon, 'currency_code', a.currency_code) end as account,
         case when d.id is null then null else jsonb_build_object(
           'id', d.id, 'name', d.name, 'color', d.color,
           'icon', d.icon, 'currency_code', d.currency_code) end as transfer_account,
         case when c.id is null then null else jsonb_build_object(
           'id', c.id, 'name', c.name, 'color', c.color,
           'icon', c.icon, 'parent_id', c.parent_id) end as category
    from transactions t
    left join accounts a on a.id = t.account_id
    left join accounts d on d.id = t.transfer_account_id
    left join categories c on c.id = t.category_id`

api.get('/transactions', h(async (req, res) => {
  const where = []
  const values = []
  const p = () => `$${values.length}`

  if (req.query.from) { values.push(req.query.from); where.push(`t.occurred_on >= ${p()}`) }
  if (req.query.to) { values.push(req.query.to); where.push(`t.occurred_on <= ${p()}`) }

  const types = asArray(req.query.types)
  if (types.length) { values.push(types); where.push(`t.type = any(${p()}::txn_type[])`) }

  const statuses = asArray(req.query.status)
  if (statuses.length) { values.push(statuses); where.push(`t.status = any(${p()}::txn_status[])`) }

  const categoryIds = asArray(req.query.categoryIds)
  if (categoryIds.length) { values.push(categoryIds); where.push(`t.category_id = any(${p()}::uuid[])`) }

  const accountIds = asArray(req.query.accountIds)
  if (accountIds.length) {
    values.push(accountIds)
    const at = p()
    where.push(`(t.account_id = any(${at}::uuid[]) or t.transfer_account_id = any(${at}::uuid[]))`)
  }

  if (req.query.uncategorized === '1') {
    where.push(`t.category_id is null and t.type in ('income','expense')`)
  }

  if (req.query.search) {
    values.push(`%${req.query.search}%`)
    const s = p()
    where.push(`(t.payee ilike ${s} or t.note ilike ${s})`)
  }
  if (req.query.minMinor) { values.push(Number(req.query.minMinor)); where.push(`t.amount_minor >= ${p()}`) }
  if (req.query.maxMinor) { values.push(Number(req.query.maxMinor)); where.push(`t.amount_minor <= ${p()}`) }

  const limit = Math.min(Number(req.query.limit) || 50, 500)
  const offset = Number(req.query.offset) || 0
  values.push(limit); const lim = p()
  values.push(offset); const off = p()

  const sql = `${TXN_SELECT}
    ${where.length ? `where ${where.join(' and ')}` : ''}
    order by t.occurred_on desc, t.created_at desc
    limit ${lim} offset ${off}`

  res.json(await query(sql, values))
}))

api.post('/transactions', h(async (req, res) => {
  const { cols, params, values } = buildInsert(req.body, TXN_FIELDS)
  res.status(201).json(await one(`insert into transactions (${cols}) values (${params}) returning *`, values))
}))

api.patch('/transactions/:id', h(async (req, res) => {
  const { clause, values, next } = buildUpdate(req.body, TXN_FIELDS)
  if (!clause) return res.json(await one('select * from transactions where id = $1', [req.params.id]))
  res.json(await one(
    `update transactions set ${clause} where id = $${next} returning *`,
    [...values, req.params.id],
  ))
}))

api.delete('/transactions/:id', h(async (req, res) => {
  await query('delete from transactions where id = $1', [req.params.id])
  res.json({ ok: true })
}))

api.post('/transactions/bulk-delete', h(async (req, res) => {
  await query('delete from transactions where id = any($1::uuid[])', [req.body.ids ?? []])
  res.json({ ok: true })
}))

api.post('/transactions/bulk-category', h(async (req, res) => {
  await query(
    'update transactions set category_id = $1 where id = any($2::uuid[])',
    [req.body.category_id ?? null, req.body.ids ?? []],
  )
  res.json({ ok: true })
}))

/* --------------------------------------------------------------- budgets -- */

const BUDGET_FIELDS = [
  'name', 'amount_minor', 'currency_code', 'period',
  'starts_on', 'ends_on', 'rollover', 'color', 'archived',
]

api.get('/budgets', h(async (_req, res) => {
  res.json(await query('select * from budgets order by created_at'))
}))

api.get('/budgets/progress', h(async (req, res) => {
  const ref = req.query.ref || today()
  res.json(await query('select * from budget_progress($1::date)', [ref]))
}))

api.get('/budgets/:id/scope', h(async (req, res) => {
  const [cats, accs] = await Promise.all([
    query('select category_id from budget_categories where budget_id = $1', [req.params.id]),
    query('select account_id from budget_accounts where budget_id = $1', [req.params.id]),
  ])
  res.json({
    categoryIds: cats.map((r) => r.category_id),
    accountIds: accs.map((r) => r.account_id),
  })
}))

/** Create or update a budget and replace its scope in one transaction. */
async function saveBudget(id, body) {
  return tx(async (client) => {
    let budget
    if (id) {
      const { clause, values, next } = buildUpdate(body, BUDGET_FIELDS)
      budget = clause
        ? (await client.query(`update budgets set ${clause} where id = $${next} returning *`, [...values, id])).rows[0]
        : (await client.query('select * from budgets where id = $1', [id])).rows[0]
    } else {
      const { cols, params, values } = buildInsert(body, BUDGET_FIELDS)
      budget = (await client.query(`insert into budgets (${cols}) values (${params}) returning *`, values)).rows[0]
    }

    if (Array.isArray(body.categoryIds)) {
      await client.query('delete from budget_categories where budget_id = $1', [budget.id])
      if (body.categoryIds.length) {
        await client.query(
          `insert into budget_categories (budget_id, category_id)
           select $1, unnest($2::uuid[])`,
          [budget.id, body.categoryIds],
        )
      }
    }
    if (Array.isArray(body.accountIds)) {
      await client.query('delete from budget_accounts where budget_id = $1', [budget.id])
      if (body.accountIds.length) {
        await client.query(
          `insert into budget_accounts (budget_id, account_id)
           select $1, unnest($2::uuid[])`,
          [budget.id, body.accountIds],
        )
      }
    }
    return budget
  })
}

api.post('/budgets', h(async (req, res) => res.status(201).json(await saveBudget(null, req.body))))
api.patch('/budgets/:id', h(async (req, res) => res.json(await saveBudget(req.params.id, req.body))))

api.delete('/budgets/:id', h(async (req, res) => {
  await query('delete from budgets where id = $1', [req.params.id])
  res.json({ ok: true })
}))

/* ----------------------------------------------------------------- goals -- */

const GOAL_FIELDS = [
  'name', 'target_minor', 'currency_code', 'account_id', 'target_date',
  'color', 'icon', 'note', 'achieved_at', 'archived',
]

api.get('/goals', h(async (_req, res) => {
  res.json(await query(
    `select g.*,
            coalesce(c.saved, 0)::bigint as saved_minor,
            c.first_on as first_contribution_on
       from goals g
       left join (select goal_id, sum(amount_minor) as saved, min(occurred_on) as first_on
                    from goal_contributions group by goal_id) c on c.goal_id = g.id
      order by g.created_at`,
  ))
}))

api.post('/goals', h(async (req, res) => {
  const { cols, params, values } = buildInsert(req.body, GOAL_FIELDS)
  res.status(201).json(await one(`insert into goals (${cols}) values (${params}) returning *`, values))
}))

api.patch('/goals/:id', h(async (req, res) => {
  const { clause, values, next } = buildUpdate(req.body, GOAL_FIELDS)
  if (!clause) return res.json(await one('select * from goals where id = $1', [req.params.id]))
  res.json(await one(`update goals set ${clause} where id = $${next} returning *`, [...values, req.params.id]))
}))

api.delete('/goals/:id', h(async (req, res) => {
  await query('delete from goals where id = $1', [req.params.id])
  res.json({ ok: true })
}))

api.get('/goals/:id/contributions', h(async (req, res) => {
  res.json(await query(
    'select * from goal_contributions where goal_id = $1 order by occurred_on desc, created_at desc',
    [req.params.id],
  ))
}))

api.post('/goals/:id/contributions', h(async (req, res) => {
  const { amount_minor, occurred_on, note } = req.body
  res.status(201).json(await one(
    `insert into goal_contributions (goal_id, amount_minor, occurred_on, note)
     values ($1, $2, $3, $4) returning *`,
    [req.params.id, amount_minor, occurred_on, note ?? null],
  ))
}))

api.delete('/contributions/:id', h(async (req, res) => {
  await query('delete from goal_contributions where id = $1', [req.params.id])
  res.json({ ok: true })
}))

/* ----------------------------------------------------------------- debts -- */

const DEBT_FIELDS = [
  'kind', 'person_name', 'amount_minor', 'currency_code', 'account_id',
  'occurred_on', 'due_on', 'note', 'settled_at',
]

api.get('/debts', h(async (_req, res) => {
  res.json(await query(
    `select d.*,
            coalesce(p.paid, 0)::bigint as paid_minor,
            (d.amount_minor - coalesce(p.paid, 0))::bigint as remaining_minor
       from debts d
       left join (select debt_id, sum(amount_minor) as paid
                    from debt_payments group by debt_id) p on p.debt_id = d.id
      order by d.due_on nulls last, d.occurred_on desc`,
  ))
}))

api.post('/debts', h(async (req, res) => {
  const { cols, params, values } = buildInsert(req.body, DEBT_FIELDS)
  res.status(201).json(await one(`insert into debts (${cols}) values (${params}) returning *`, values))
}))

api.patch('/debts/:id', h(async (req, res) => {
  const { clause, values, next } = buildUpdate(req.body, DEBT_FIELDS)
  if (!clause) return res.json(await one('select * from debts where id = $1', [req.params.id]))
  res.json(await one(`update debts set ${clause} where id = $${next} returning *`, [...values, req.params.id]))
}))

api.delete('/debts/:id', h(async (req, res) => {
  await query('delete from debts where id = $1', [req.params.id])
  res.json({ ok: true })
}))

api.get('/debts/:id/payments', h(async (req, res) => {
  res.json(await query(
    'select * from debt_payments where debt_id = $1 order by occurred_on desc, created_at desc',
    [req.params.id],
  ))
}))

api.post('/debts/:id/payments', h(async (req, res) => {
  const { amount_minor, occurred_on, note } = req.body
  res.status(201).json(await one(
    `insert into debt_payments (debt_id, amount_minor, occurred_on, note)
     values ($1, $2, $3, $4) returning *`,
    [req.params.id, amount_minor, occurred_on, note ?? null],
  ))
}))

/* ------------------------------------------------------------- recurring -- */

const RULE_FIELDS = [
  'name', 'type', 'account_id', 'transfer_account_id', 'category_id',
  'amount_minor', 'currency_code', 'payee', 'note', 'freq', 'interval_count',
  'starts_on', 'ends_on', 'next_occurrence_on', 'auto_create',
  'remind_days_before', 'archived',
]

api.get('/recurring', h(async (_req, res) => {
  res.json(await query('select * from recurring_rules order by next_occurrence_on'))
}))

api.post('/recurring', h(async (req, res) => {
  const { cols, params, values } = buildInsert(req.body, RULE_FIELDS)
  res.status(201).json(await one(`insert into recurring_rules (${cols}) values (${params}) returning *`, values))
}))

api.patch('/recurring/:id', h(async (req, res) => {
  const { clause, values, next } = buildUpdate(req.body, RULE_FIELDS)
  if (!clause) return res.json(await one('select * from recurring_rules where id = $1', [req.params.id]))
  res.json(await one(
    `update recurring_rules set ${clause} where id = $${next} returning *`,
    [...values, req.params.id],
  ))
}))

api.delete('/recurring/:id', h(async (req, res) => {
  await query('delete from recurring_rules where id = $1', [req.params.id])
  res.json({ ok: true })
}))

api.post('/recurring/generate', h(async (req, res) => {
  const through = req.body?.through || today()
  const row = await one('select generate_due_recurring($1::date) as created', [through])
  res.json({ created: row.created })
}))

/* --------------------------------------------------------------- reports -- */

api.get('/reports/category-totals', h(async (req, res) => {
  const { from, to, currency, kind = 'expense' } = req.query
  res.json(await query(
    'select * from category_totals($1::date, $2::date, $3, $4::category_kind)',
    [from, to, currency, kind],
  ))
}))

api.get('/reports/cashflow', h(async (req, res) => {
  const { from, to, currency, bucket = 'month' } = req.query
  res.json(await query(
    'select * from cashflow_series($1::date, $2::date, $3, $4)',
    [from, to, currency, bucket],
  ))
}))

api.get('/reports/net-worth', h(async (req, res) => {
  const { currency, asOf } = req.query
  const row = await one('select * from net_worth($1, $2::date)', [
    currency, asOf || today(),
  ])
  res.json(row ?? { assets_minor: 0, liabilities_minor: 0, net_minor: 0, missing_rate: false })
}))

api.get('/reports/insights', h(async (req, res) => {
  const { from, to, currency } = req.query
  if (!from || !to || !currency) {
    return res.status(400).json({ error: { message: 'from, to and currency are required' } })
  }
  res.json(await insights({
    from, to, currency,
    limit: Math.min(Number(req.query.limit) || 5, 25),
  }))
}))

/* --------------------------------------------------------------- advisor -- */

api.get('/advisor/forecast', h(async (req, res) => {
  const currency = req.query.currency
  if (!currency) return res.status(400).json({ error: { message: 'currency is required' } })
  res.json(await forecast({
    currency,
    // How far into next month the chart should run. The window itself is
    // always this calendar month.
    graceDays: Math.min(Math.max(Number(req.query.grace) || 5, 0), 31),
  }))
}))

api.get('/advisor/budget-suggestions', h(async (req, res) => {
  const currency = req.query.currency
  if (!currency) return res.status(400).json({ error: { message: 'currency is required' } })
  res.json(await budgetSuggestions({ currency, months: Math.min(Number(req.query.months) || 3, 12) }))
}))

api.get('/advisor/subscriptions', h(async (req, res) => {
  const currency = req.query.currency
  if (!currency) return res.status(400).json({ error: { message: 'currency is required' } })
  res.json(await subscriptions({ currency }))
}))

api.get('/advisor/unusual', h(async (req, res) => {
  const { from, to, currency } = req.query
  if (!from || !to || !currency) {
    return res.status(400).json({ error: { message: 'from, to and currency are required' } })
  }
  res.json(await unusualExpenses({ from, to, currency }))
}))

api.get('/advisor/trends', h(async (req, res) => {
  const currency = req.query.currency
  if (!currency) return res.status(400).json({ error: { message: 'currency is required' } })
  res.json(await categoryTrends({ currency, months: Math.min(Number(req.query.months) || 6, 24) }))
}))

api.get('/advisor/uncategorized', h(async (_req, res) => {
  res.json(await uncategorized())
}))

api.get('/payees/suggest', h(async (req, res) => {
  res.json(await payeeSuggestions(req.query.q ?? '', Math.min(Number(req.query.limit) || 8, 25)))
}))

api.post('/accounts/:id/reconcile', h(async (req, res) => {
  const { actual_balance_minor, occurred_on, note } = req.body ?? {}
  if (typeof actual_balance_minor !== 'number') {
    return res.status(400).json({ error: { message: 'actual_balance_minor must be a number' } })
  }
  res.json(await reconcile({
    accountId: req.params.id,
    actualBalanceMinor: actual_balance_minor,
    occurredOn: occurred_on,
    note,
  }))
}))

/** The last transaction, so "repeat that" needs no typing at all. */
api.get('/transactions/last', h(async (_req, res) => {
  res.json(await one(
    `select * from transactions
      where type in ('income','expense') and status <> 'void'
      order by created_at desc limit 1`,
  ))
}))