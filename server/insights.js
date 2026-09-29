import { one, query } from './db.js'
import { addDays, daysBetween as diff, today as todayIso } from './dates.js'

/** Inclusive span: the same date twice is one day, not zero. */
const daysBetween = (from, to) => diff(from, to) + 1

/** Only rows that count: real money, in accounts included in stats. */
const FROM = `
    from transactions t
    join accounts a on a.id = t.account_id and a.exclude_from_stats = false`

/** The same rows, with each transaction's category and its parent attached. */
const FROM_WITH_CATEGORY = `${FROM}
    left join categories c on c.id = t.category_id
    left join categories p on p.id = c.parent_id`

const WHERE = `
   where t.status <> 'void'
     and t.occurred_on between $1 and $2`

const SCOPE = `${FROM}${WHERE}`

const CONV = `convert_minor(t.amount_minor, t.currency_code, $3, t.occurred_on)`

async function totals(from, to, currency) {
  const row = await one(
    `select
       coalesce(sum(${CONV}) filter (where t.type = 'income'), 0)::bigint  as income_minor,
       coalesce(sum(${CONV}) filter (where t.type = 'expense'), 0)::bigint as expense_minor,
       count(*) filter (where t.type in ('income','expense'))::int          as txn_count,
       coalesce(bool_or(${CONV} is null) filter (where t.type in ('income','expense')), false) as missing_rate
     ${SCOPE} and t.type in ('income','expense')`,
    [from, to, currency],
  )
  const income = row?.income_minor ?? 0
  const expense = row?.expense_minor ?? 0
  return {
    income_minor: income,
    expense_minor: expense,
    net_minor: income - expense,
    txn_count: row?.txn_count ?? 0,
    missing_rate: row?.missing_rate ?? false,
  }
}

/**
 * Everything the dashboard needs to answer "where is the money going, and is
 * that more than usual" in one round trip. The comparison period is the same
 * number of days immediately before the range, so a 30-day window is compared
 * with the 30 days before it rather than with a calendar month of a different
 * length.
 */
export async function insights({ from, to, currency, limit = 5 }) {
  const span = Math.max(1, daysBetween(from, to))
  const prevTo = addDays(from, -1)
  const prevFrom = addDays(prevTo, -(span - 1))

  const [current, previous, cats, prevCats, payees, biggest] = await Promise.all([
    totals(from, to, currency),
    totals(prevFrom, prevTo, currency),
    query('select * from category_totals($1::date, $2::date, $3, $4::category_kind)',
      [from, to, currency, 'expense']),
    query('select * from category_totals($1::date, $2::date, $3, $4::category_kind)',
      [prevFrom, prevTo, currency, 'expense']),
    query(
      `select btrim(t.payee) as payee,
              coalesce(sum(${CONV}), 0)::bigint as total_minor,
              count(*)::int as txn_count
       ${SCOPE} and t.type = 'expense'
         and t.payee is not null and btrim(t.payee) <> ''
       group by btrim(t.payee)
       order by total_minor desc
       limit $4`,
      [from, to, currency, limit],
    ),
    query(
      `select t.id, t.occurred_on, t.payee, t.amount_minor, t.currency_code,
              ${CONV} as converted_minor,
              coalesce(p.name || ' › ' || c.name, c.name, 'Uncategorized') as category_name,
              coalesce(p.color, c.color, '#8E8E93') as color
       ${FROM_WITH_CATEGORY}${WHERE} and t.type = 'expense'
       order by converted_minor desc nulls last
       limit $4`,
      [from, to, currency, limit],
    ),
  ])

  // Only the days that have actually happened count toward the average, so a
  // projection made on the 5th is not diluted by the rest of the month.
  const today = todayIso()
  const elapsed = today < from ? 0
    : today > to ? span
    : Math.max(1, daysBetween(from, today))

  const avgPerDay = elapsed > 0 ? Math.round(current.expense_minor / elapsed) : 0

  const prevByCategory = new Map(prevCats.map((c) => [c.category_name, c.total_minor]))
  const categories = cats.map((c) => ({
    ...c,
    prev_total_minor: prevByCategory.get(c.category_name) ?? 0,
  }))

  return {
    currency,
    range: { from, to, days: span },
    previous_range: { from: prevFrom, to: prevTo },
    totals: current,
    previous_totals: previous,
    categories,
    top_payees: payees,
    biggest_expenses: biggest,
    pace: {
      days_elapsed: elapsed,
      days_in_range: span,
      avg_per_day_minor: avgPerDay,
      // Straight-line: what the whole range costs if the rest looks like so far.
      projected_expense_minor: avgPerDay * span,
      is_partial: elapsed > 0 && elapsed < span,
    },
    missing_rate: current.missing_rate || previous.missing_rate,
  }
}
