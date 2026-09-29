import { useMemo } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { ArrowDownRight, ArrowUpRight, Minus, Receipt, Store, TriangleAlert } from 'lucide-react'
import { Money } from '@/components/Money'
import { EmptyState } from '@/components/ui'
import { useCurrencies } from '@/hooks/useReference'
import { formatMoney } from '@/lib/money'
import { shortDate } from '@/lib/dates'
import type { Insights } from '@/lib/types'

/* ------------------------------------------------------------------ delta */

/**
 * Percentage change against the previous period. `goodDirection` decides the
 * colour: spending more is bad, earning more is good, so the same arrow means
 * opposite things and the colour has to say which.
 */
export function Delta({
  current, previous, goodDirection,
}: { current: number; previous: number; goodDirection: 'up' | 'down' }) {
  if (previous === 0 && current === 0) {
    return <span className="chip !py-0.5 muted"><Minus size={12} /> no change</span>
  }
  if (previous === 0) {
    return (
      <span className="chip !py-0.5" style={{ color: goodDirection === 'up' ? 'var(--credit)' : 'var(--debit)' }}>
        <ArrowUpRight size={12} /> new
      </span>
    )
  }

  const pct = ((current - previous) / Math.abs(previous)) * 100
  const rounded = Math.abs(pct) < 0.5 ? 0 : Math.round(pct)
  if (rounded === 0) {
    return <span className="chip !py-0.5 muted"><Minus size={12} /> level</span>
  }

  const up = rounded > 0
  const good = up === (goodDirection === 'up')
  const color = good ? 'var(--credit)' : 'var(--debit)'

  return (
    <span className="chip !py-0.5 fig" style={{ color, borderColor: 'transparent', background: `${good ? 'var(--credit-soft)' : 'var(--debit-soft)'}` }}>
      {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {Math.abs(rounded)}%
    </span>
  )
}

/* ------------------------------------------------------------- stat tiles */

export function PeriodTiles({ data }: { data: Insights }) {
  const { totals, previous_totals: prev, currency } = data

  const tiles = [
    { label: 'Money in', value: totals.income_minor, prev: prev.income_minor, good: 'up' as const, tone: 'credit' as const },
    { label: 'Money out', value: totals.expense_minor, prev: prev.expense_minor, good: 'down' as const, tone: 'debit' as const },
    { label: 'Net', value: totals.net_minor, prev: prev.net_minor, good: 'up' as const, tone: 'auto' as const },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {tiles.map((t) => (
        <div key={t.label} className="panel px-4 py-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs muted">{t.label}</span>
            <Delta current={t.value} previous={t.prev} goodDirection={t.good} />
          </div>
          <div className="mt-1.5">
            <Money minor={t.value} currency={currency} size="xl" tone={t.tone} signed={t.tone === 'auto'} />
          </div>
          <p className="mt-0.5 text-xs muted">
            was <Money minor={t.prev} currency={currency} size="sm" tone="muted" /> before
          </p>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------ spending by categories */

export function SpendingByCategories({ data }: { data: Insights }) {
  const { data: currencies } = useCurrencies()
  const { categories, totals, previous_totals: prev, currency, pace } = data

  const total = totals.expense_minor
  const slices = useMemo(
    () => categories.filter((c) => c.total_minor > 0).slice(0, 9),
    [categories],
  )

  return (
    <section className="panel overflow-hidden">
      <div className="px-5 pb-3 pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[0.9375rem] font-semibold">Spending by category</h2>
          <span className="text-xs muted">
            vs {shortDate(data.previous_range.from)} – {shortDate(data.previous_range.to)}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Money minor={total} currency={currency} size="hero" tone="plain" />
          <Delta current={total} previous={prev.expense_minor} goodDirection="down" />
        </div>

        {pace.is_partial && total > 0 && (
          <p className="mt-2 text-sm muted">
            <Money minor={pace.avg_per_day_minor} currency={currency} tone="plain" size="sm" /> a day so far.
            {' '}At this rate the period ends at{' '}
            <Money minor={pace.projected_expense_minor} currency={currency} tone="debit" size="sm" />.
          </p>
        )}

        {data.missing_rate && (
          <p className="mt-2 flex items-start gap-1.5 text-xs" style={{ color: 'var(--warn)' }}>
            <TriangleAlert size={13} className="mt-px shrink-0" />
            Some spending is in a currency with no saved exchange rate, so it is left out.
          </p>
        )}
      </div>

      {slices.length === 0 ? (
        <EmptyState title="Nothing spent in this period" body="Add a transaction and the split appears here." />
      ) : (
        <div className="grid gap-4 border-t px-5 py-4 lg:grid-cols-[minmax(0,220px)_1fr]"
             style={{ borderColor: 'var(--rule)' }}>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="total_minor" nameKey="category_name"
                     innerRadius="60%" outerRadius="90%" paddingAngle={2} stroke="none">
                  {slices.map((d) => <Cell key={d.category_name} fill={d.color} />)}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)', border: '1px solid var(--rule-strong)',
                    borderRadius: 10, fontSize: 13, color: 'var(--ink)',
                  }}
                  formatter={(v: number, n: string) => [formatMoney(v, currencies?.[currency]), n]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div>
            {categories.map((c) => {
              const share = total > 0 ? (c.total_minor / total) * 100 : 0
              return (
                <div key={`${c.category_id}-${c.category_name}`} className="row-rule py-2">
                  <div className="flex items-baseline gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm">{c.category_name}</span>
                    <span className="fig text-xs muted">{share.toFixed(0)}%</span>
                    <Delta current={c.total_minor} previous={c.prev_total_minor} goodDirection="down" />
                    <Money minor={c.total_minor} currency={currency} tone="plain" />
                  </div>
                  <div className="mt-1.5 ml-[1.125rem] h-1 overflow-hidden rounded-full"
                       style={{ background: 'var(--surface-sunk)' }}>
                    <div className="h-full rounded-full" style={{ width: `${share}%`, background: c.color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

/* --------------------------------------------------- payees and big items */

export function TopPayees({ data }: { data: Insights }) {
  const max = data.top_payees[0]?.total_minor ?? 0
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--rule)' }}>
        <Store size={16} className="muted" />
        <h2 className="text-[0.9375rem] font-semibold">Where it goes most</h2>
      </div>
      {data.top_payees.length === 0 ? (
        <EmptyState
          title="No payees yet"
          body="Fill in the 'Paid to' field on a transaction and the biggest ones are ranked here."
        />
      ) : (
        data.top_payees.map((p) => (
          <div key={p.payee} className="row-rule px-4 py-2.5">
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.payee}</span>
              <span className="text-xs muted">{p.txn_count}×</span>
              <Money minor={p.total_minor} currency={data.currency} tone="plain" />
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full" style={{ background: 'var(--surface-sunk)' }}>
              <div className="h-full rounded-full"
                   style={{ width: `${max > 0 ? (p.total_minor / max) * 100 : 0}%`, background: 'var(--accent)' }} />
            </div>
          </div>
        ))
      )}
    </section>
  )
}

export function BiggestExpenses({ data }: { data: Insights }) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--rule)' }}>
        <Receipt size={16} className="muted" />
        <h2 className="text-[0.9375rem] font-semibold">Biggest single expenses</h2>
      </div>
      {data.biggest_expenses.length === 0 ? (
        <EmptyState title="Nothing spent in this period" />
      ) : (
        data.biggest_expenses.map((e) => (
          <div key={e.id} className="row-rule flex items-center gap-3 px-4 py-2.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: e.color }} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{e.payee || e.category_name}</span>
              <span className="block truncate text-xs muted">
                {shortDate(e.occurred_on)} · {e.category_name}
              </span>
            </span>
            <Money minor={e.amount_minor} currency={e.currency_code} tone="debit" />
          </div>
        ))
      )}
    </section>
  )
}
