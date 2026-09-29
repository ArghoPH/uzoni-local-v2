import { one, query } from './db.js'
import { addDays, addMonths, daysBetween, endOfMonth, startOfMonth, today as todayIso } from './dates.js'

/** Round to something a person would actually write down. */
function roundUpTo(minor, stepMinor) {
  if (minor <= 0) return 0
  return Math.ceil(minor / stepMinor) * stepMinor
}

/* --------------------------------------------------------------- forecast */

/**
 * Answers "how much can I spend today without running out before the next
 * money arrives", and draws the balance forward so the day it runs out is
 * visible rather than a surprise.
 *
 * Committed money — planned payments due before the next income, plus whatever
 * is already sitting in savings goals — is taken off the top. What is left is
 * spread evenly over the days remaining, because an even allowance is the only
 * kind a person can act on without doing arithmetic.
 */
export async function forecast({ currency, graceDays = 5 }) {
  const today = todayIso()

  /*
    The horizon is the month, not an arbitrary window. People budget in months
    and get paid at the turn of one, so a chart running 45 days out disagreed
    with a headline that said "until 30 Sep" and the two together read as a
    mistake. It now stops a few days into next month — far enough to show the
    next salary landing, close enough to still be this month's question.
  */
  const monthEnd = endOfMonth(today)
  const through = addDays(monthEnd, graceDays)
  const horizonDays = Math.max(1, daysBetween(today, through))

  const [balanceRow, occurrences, goalsRow, spendRow] = await Promise.all([
    one(
      `select coalesce(sum(convert_minor(b.balance_minor, a.currency_code, $1, current_date)), 0)::bigint as total,
              coalesce(bool_or(convert_minor(b.balance_minor, a.currency_code, $1, current_date) is null), false) as missing_rate
         from accounts a
         join account_balances b on b.account_id = a.id
        where a.archived = false and a.exclude_from_stats = false`,
      [currency],
    ),
    query(
      `select o.*, convert_minor(o.amount_minor, o.currency_code, $2, o.occurs_on) as converted_minor
         from upcoming_occurrences($1::date) o
        where o.type in ('income', 'expense')
        order by o.occurs_on`,
      [through, currency],
    ),
    one(
      `select coalesce(sum(convert_minor(c.saved, g.currency_code, $1, current_date)), 0)::bigint as reserved
         from goals g
         join (select goal_id, sum(amount_minor)::bigint as saved
                 from goal_contributions group by goal_id) c on c.goal_id = g.id
        where g.archived = false and g.achieved_at is null and c.saved > 0`,
      [currency],
    ),
    one(
      // Day-to-day spending only: anything a planned payment posted is already
      // counted as a dated commitment, so counting it here too would double it.
      `select coalesce(sum(convert_minor(t.amount_minor, t.currency_code, $1, t.occurred_on)), 0)::bigint as total,
              count(*)::int as txn_count,
              min(t.occurred_on) as first_on
         from transactions t
         join accounts a on a.id = t.account_id and a.exclude_from_stats = false
        where t.status <> 'void'
          and t.type = 'expense'
          and t.recurring_rule_id is null
          and t.occurred_on >= current_date - 90
          and t.occurred_on <= current_date`,
      [currency],
    ),
  ])

  const balance = balanceRow?.total ?? 0
  const reserved = goalsRow?.reserved ?? 0
  /*
    Averaged over the days actually on record, not a flat ninety. A ledger three
    days old divided by ninety reports a burn rate near zero and a runway of
    years, which is worse than admitting there is not enough history yet.
  */
  const burnDays = spendRow?.first_on
    ? Math.min(90, Math.max(1, daysBetween(spendRow.first_on, today) + 1))
    : 0
  const dailyBurn = burnDays > 0 ? Math.round((spendRow?.total ?? 0) / burnDays) : 0
  const burnConfident = burnDays >= 14 && (spendRow?.txn_count ?? 0) >= 5

  const incomes = occurrences.filter((o) => o.type === 'income')
  const expenses = occurrences.filter((o) => o.type === 'expense')

  const nextIncome = incomes[0] ?? null
  // No scheduled income? Fall back to the end of the month, which is the
  // horizon most people are budgeting against anyway.
  const until = nextIncome?.occurs_on ?? endOfMonth(today)
  const daysUntil = Math.max(1, daysBetween(today, until))

  const committed = expenses
    .filter((e) => e.occurs_on <= until)
    .reduce((sum, e) => sum + (e.converted_minor ?? 0), 0)

  const available = balance - committed - reserved
  const safePerDay = Math.floor(Math.max(0, available) / daysUntil)

  // Walk the balance forward day by day.
  const series = []
  let running = balance
  let runwayDay = null
  for (let i = 0; i <= horizonDays; i++) {
    const date = addDays(today, i)
    if (i > 0) {
      for (const o of occurrences) {
        if (o.occurs_on !== date) continue
        running += o.type === 'income' ? (o.converted_minor ?? 0) : -(o.converted_minor ?? 0)
      }
      running -= dailyBurn
    }
    series.push({ date, balance_minor: Math.round(running) })
    if (runwayDay === null && running < 0) runwayDay = date
  }

  // Only warn about running out when the spending rate behind it is real.
  if (!burnConfident) runwayDay = null

  return {
    currency,
    as_of: today,
    balance_minor: balance,
    reserved_minor: reserved,
    committed_minor: committed,
    available_minor: available,
    safe_per_day_minor: safePerDay,
    days_until: daysUntil,
    next_income: nextIncome
      ? { name: nextIncome.name, occurs_on: nextIncome.occurs_on, amount_minor: nextIncome.converted_minor }
      : null,
    until,
    month_end: monthEnd,
    horizon_to: through,
    daily_burn_minor: dailyBurn,
    burn_days_observed: burnDays,
    burn_confident: burnConfident,
    upcoming: expenses.slice(0, 8).map((e) => ({
      rule_id: e.rule_id, name: e.name, occurs_on: e.occurs_on,
      amount_minor: e.converted_minor ?? e.amount_minor,
    })),
    series,
    runway_on: runwayDay,
    runway_days: runwayDay ? daysBetween(today, runwayDay) : null,
    missing_rate: balanceRow?.missing_rate ?? false,
  }
}

/* ----------------------------------------------------- budget suggestions */

/**
 * Proposes a budget for the categories that are actually costing money and do
 * not have one yet, using the average of the last three complete months so the
 * current half-finished month cannot drag the figure down.
 */
export async function budgetSuggestions({ currency, months = 3 }) {
  const rows = await query('select * from category_monthly($1::integer, $2::text)', [months + 1, currency])
  const covered = await query(
    `select distinct bc.category_id
       from budget_categories bc
       join budgets b on b.id = bc.budget_id and b.archived = false`,
  )
  const coveredIds = new Set(covered.map((r) => r.category_id))
  const currentMonth = startOfMonth()

  const byCategory = new Map()
  for (const r of rows) {
    if (r.month_start === currentMonth) continue   // still in progress
    const entry = byCategory.get(r.category_id) ?? {
      category_id: r.category_id, category_name: r.category_name, color: r.color, totals: [],
    }
    entry.totals.push(r.total_minor)
    byCategory.set(r.category_id, entry)
  }

  return [...byCategory.values()]
    .filter((c) => c.category_id && !coveredIds.has(c.category_id) && c.totals.length >= 2)
    .map((c) => {
      const average = Math.round(c.totals.reduce((a, b) => a + b, 0) / c.totals.length)
      const highest = Math.max(...c.totals)
      return {
        category_id: c.category_id,
        category_name: c.category_name,
        color: c.color,
        months_observed: c.totals.length,
        average_minor: average,
        highest_minor: highest,
        // A budget set at the average is broken half the time, so the proposal
        // sits a little above it, rounded to a number worth saying out loud.
        suggested_minor: roundUpTo(Math.round(average * 1.1), 50000),
      }
    })
    .filter((c) => c.average_minor > 0)
    .sort((a, b) => b.average_minor - a.average_minor)
}

/* ---------------------------------------------------------- subscriptions */

const CADENCES = [
  { name: 'weekly', days: 7, tolerance: 2 },
  { name: 'biweekly', days: 14, tolerance: 3 },
  { name: 'monthly', days: 30, tolerance: 5 },
  { name: 'quarterly', days: 91, tolerance: 10 },
  { name: 'yearly', days: 365, tolerance: 20 },
]

const median = (nums) => {
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

/**
 * Finds payments that repeat on a steady rhythm for a steady amount — the
 * subscriptions people forget they have — and flags the ones whose price has
 * crept up. Rules already set up as planned payments are left out.
 */
export async function subscriptions({ currency, lookbackDays = 400 }) {
  const rows = await query(
    `select btrim(t.payee) as payee, t.occurred_on, t.category_id,
            convert_minor(t.amount_minor, t.currency_code, $1, t.occurred_on) as amount_minor,
            t.account_id, t.recurring_rule_id
       from transactions t
       join accounts a on a.id = t.account_id and a.exclude_from_stats = false
      where t.status <> 'void' and t.type = 'expense'
        and t.payee is not null and btrim(t.payee) <> ''
        and t.occurred_on >= current_date - $2::integer
      order by btrim(t.payee), t.occurred_on`,
    [currency, lookbackDays],
  )

  const byPayee = new Map()
  for (const r of rows) {
    if (r.amount_minor == null) continue
    const list = byPayee.get(r.payee) ?? []
    list.push(r)
    byPayee.set(r.payee, list)
  }

  const found = []
  for (const [payee, list] of byPayee) {
    if (list.length < 3) continue
    if (list.some((r) => r.recurring_rule_id)) continue   // already a planned payment

    const gaps = []
    for (let i = 1; i < list.length; i++) {
      gaps.push(daysBetween(list[i - 1].occurred_on, list[i].occurred_on))
    }
    const typicalGap = median(gaps)
    const cadence = CADENCES.find((c) => Math.abs(typicalGap - c.days) <= c.tolerance)
    if (!cadence) continue

    // Every gap should look like the rhythm, not just the middle one.
    const steady = gaps.every((g) => Math.abs(g - cadence.days) <= cadence.tolerance * 2)
    if (!steady) continue

    /*
      A subscription charges the same amount, not a similar one. Comparing
      every charge with the median would either let ordinary shopping through
      (grocery trips cluster loosely around a number) or reject the very thing
      worth flagging, since a price rise moves the last charge away from the
      middle. Instead: find the largest group of near-identical amounts, and
      require it to be at least half the charges.
    */
    const amounts = list.map((r) => r.amount_minor)
    const middle = median(amounts)
    if (middle <= 0) continue

    let baseAmount = 0
    let clusterSize = 0
    for (const candidate of amounts) {
      const size = amounts.filter((a) => Math.abs(a - candidate) / middle <= 0.02).length
      if (size > clusterSize) { clusterSize = size; baseAmount = candidate }
    }
    if (clusterSize < 2 || clusterSize / amounts.length < 0.5) continue

    const last = list[list.length - 1]
    const typicalAmount = baseAmount
    // Creep is measured against the settled price, not the first charge, so an
    // introductory offer does not read as a permanent rise.
    const creep = baseAmount > 0
      ? Math.round(((last.amount_minor - baseAmount) / baseAmount) * 100)
      : 0

    found.push({
      payee,
      cadence: cadence.name,
      occurrences: list.length,
      typical_amount_minor: typicalAmount,
      last_amount_minor: last.amount_minor,
      last_seen_on: last.occurred_on,
      next_expected_on: addDays(last.occurred_on, cadence.days),
      account_id: last.account_id,
      category_id: last.category_id,
      yearly_cost_minor: Math.round(typicalAmount * (365 / cadence.days)),
      price_change_pct: creep,
      price_crept: creep >= 5,
    })
  }

  return found.sort((a, b) => b.yearly_cost_minor - a.yearly_cost_minor)
}

/* -------------------------------------------------------------- anomalies */

/**
 * Expenses far above what that category normally costs. Compared against the
 * median of the last six months, so a category with one huge purchase does not
 * quietly raise its own threshold.
 */
export async function unusualExpenses({ from, to, currency, multiple = 2.5, limit = 8 }) {
  return query(
    `with typical as (select * from category_typical(180, $3::text))
     select t.id, t.occurred_on, t.payee, t.amount_minor, t.currency_code,
            convert_minor(t.amount_minor, t.currency_code, $3, t.occurred_on) as converted_minor,
            coalesce(parent.name || ' › ' || c.name, c.name, 'Uncategorized') as category_name,
            coalesce(parent.color, c.color, '#8E8E93') as color,
            ty.median_minor,
            round(
              convert_minor(t.amount_minor, t.currency_code, $3, t.occurred_on)::numeric
              / nullif(ty.median_minor, 0)::numeric, 1)::float as times_typical
       from transactions t
       join accounts a on a.id = t.account_id and a.exclude_from_stats = false
       left join categories c on c.id = t.category_id
       left join categories parent on parent.id = c.parent_id
       join typical ty on ty.category_id = coalesce(parent.id, c.id)
      where t.status <> 'void' and t.type = 'expense'
        and t.occurred_on between $1 and $2
        and ty.txn_count >= 4
        and ty.median_minor > 0
        and convert_minor(t.amount_minor, t.currency_code, $3, t.occurred_on) > (ty.median_minor::numeric * $4::numeric)
      order by times_typical desc
      limit $5::integer`,
    [from, to, currency, multiple, limit],
  )
}

/* ----------------------------------------------------------------- trends */

/**
 * Six months of spend per category with a plain-language direction, so a
 * category that is slowly getting worse is visible before it becomes a problem.
 */
export async function categoryTrends({ currency, months = 6, limit = 8 }) {
  const rows = await query('select * from category_monthly($1::integer, $2::text)', [months, currency])

  const thisMonth = startOfMonth()
  const monthKeys = []
  for (let i = months - 1; i >= 0; i--) monthKeys.push(addMonths(thisMonth, -i))

  const byCategory = new Map()
  for (const r of rows) {
    const entry = byCategory.get(r.category_id ?? 'none') ?? {
      category_id: r.category_id,
      category_name: r.category_name,
      color: r.color,
      values: new Map(),
    }
    entry.values.set(r.month_start, r.total_minor)
    byCategory.set(r.category_id ?? 'none', entry)
  }

  return [...byCategory.values()]
    .map((c) => {
      const series = monthKeys.map((m) => ({ month: m, total_minor: c.values.get(m) ?? 0 }))
      // Compare the most recent complete stretch with the one before it rather
      // than first-vs-last, which one quiet month would flip.
      const half = Math.floor(months / 2)
      const older = series.slice(0, half).reduce((a, b) => a + b.total_minor, 0)
      const newer = series.slice(months - half).reduce((a, b) => a + b.total_minor, 0)
      const changePct = older > 0 ? Math.round(((newer - older) / older) * 100) : (newer > 0 ? 100 : 0)
      return {
        ...c,
        values: undefined,
        series,
        total_minor: series.reduce((a, b) => a + b.total_minor, 0),
        change_pct: changePct,
        direction: changePct >= 15 ? 'rising' : changePct <= -15 ? 'falling' : 'steady',
      }
    })
    .filter((c) => c.total_minor > 0)
    .sort((a, b) => b.total_minor - a.total_minor)
    .slice(0, limit)
}

/* ------------------------------------------------------- entry assistance */

/** What this payee usually means: which category, and roughly how much. */
export async function payeeSuggestions(search, limit = 8) {
  const term = (search ?? '').trim()
  return query(
    `with recent as (
       select btrim(t.payee) as payee, t.category_id, t.amount_minor, t.currency_code,
              t.account_id, t.type, t.occurred_on,
              row_number() over (partition by btrim(t.payee) order by t.occurred_on desc) as rn,
              count(*) over (partition by btrim(t.payee)) as uses
         from transactions t
        where t.payee is not null and btrim(t.payee) <> '' and t.status <> 'void'
          and ($1 = '' or t.payee ilike '%' || $1 || '%')
     )
     select r.payee, r.category_id, r.amount_minor, r.currency_code, r.account_id, r.type,
            r.occurred_on as last_used_on, r.uses::int as use_count,
            coalesce(p.name || ' › ' || c.name, c.name) as category_name
       from recent r
       left join categories c on c.id = r.category_id
       left join categories p on p.id = c.parent_id
      where r.rn = 1
      order by r.uses desc, r.occurred_on desc
      limit $2`,
    [term, limit],
  )
}

/** Transactions with no category, which quietly break every report. */
export async function uncategorized() {
  return one(
    `select count(*)::int as count,
            min(t.occurred_on) as oldest_on,
            coalesce(sum(t.amount_minor), 0)::bigint as amount_minor
       from transactions t
      where t.category_id is null
        and t.type in ('income', 'expense')
        and t.status <> 'void'`,
  )
}

/* ------------------------------------------------------------- reconcile */

/**
 * Makes the app agree with reality. You count the cash, and the difference is
 * written as one ordinary transaction — never as a silent edit to a balance,
 * which would leave the ledger unable to explain itself.
 */
export async function reconcile({ accountId, actualBalanceMinor, occurredOn, note }) {
  const account = await one('select * from accounts where id = $1', [accountId])
  if (!account) {
    const err = new Error('Account does not exist')
    err.code = '23503'
    throw err
  }

  const balance = await one('select balance_minor from account_balances where account_id = $1', [accountId])
  const current = balance?.balance_minor ?? 0
  const difference = actualBalanceMinor - current

  if (difference === 0) {
    return { adjusted: false, difference_minor: 0, balance_minor: current, transaction: null }
  }

  const transaction = await one(
    `insert into transactions (type, account_id, amount_minor, currency_code, occurred_on, payee, note)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning *`,
    [
      difference > 0 ? 'income' : 'expense',
      accountId,
      Math.abs(difference),
      account.currency_code,
      occurredOn ?? todayIso(),
      'Balance adjustment',
      note ?? 'Reconciled against a counted balance',
    ],
  )

  return {
    adjusted: true,
    difference_minor: difference,
    balance_minor: actualBalanceMinor,
    transaction,
  }
}