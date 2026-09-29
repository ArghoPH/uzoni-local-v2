import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, TriangleAlert } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Button, EmptyState, ErrorNote, Meter, Segmented, SkeletonRows, useToast } from '@/components/ui'
import { Money } from '@/components/Money'
import { TransactionList } from '@/components/TransactionList'
import { TransactionDialog } from '@/components/TransactionDialog'
import { AccountSheet } from '@/components/AccountSheet'
import {
  BiggestExpenses, PeriodTiles, SpendingByCategories, TopPayees,
} from '@/components/SpendingInsights'
import { SafeToSpend } from '@/components/SafeToSpend'
import { AdviceFeed } from '@/components/AdviceFeed'
import { useAccounts } from '@/hooks/useAccounts'
import { useProfile, useCurrencies } from '@/hooks/useReference'
import { useTransactions, useGenerateRecurring } from '@/hooks/useTransactions'
import { useBudgetProgress, useRecurring } from '@/hooks/usePlanning'
import { useCashflow, useInsights, useNetWorth } from '@/hooks/useReports'
import {
  useBudgetSuggestions, useCategoryTrends, useForecast, useSubscriptions,
  useUncategorized, useUnusual,
} from '@/hooks/useAdvisor'
import { bucketLabel, daysUntil, dueLabel, iso, RANGE_LABELS, rangeFor, today } from '@/lib/dates'
import type { RangeKey } from '@/lib/dates'
import { formatCompact } from '@/lib/money'
import { humanizeError } from '@/lib/api'
import type { AccountWithBalance, TransactionRow } from '@/lib/types'

export function Dashboard() {
  const toast = useToast()
  const { data: profile } = useProfile()
  const { data: currencies } = useCurrencies()
  const base = profile?.base_currency ?? 'BDT'

  const month = rangeFor('this_month')
  const last6 = useMemo(() => {
    const to = new Date()
    const from = new Date(to.getFullYear(), to.getMonth() - 5, 1)
    // iso() formats from local parts; toISOString would shift a local midnight
    // back a day for anyone east of Greenwich.
    return { from: iso(from), to: iso(to) }
  }, [])

  const accounts = useAccounts()
  const netWorth = useNetWorth(base, today())
  const cashflow = useCashflow(last6.from, last6.to, base, 'month')
  const budgets = useBudgetProgress(today())
  const recurring = useRecurring()
  const recent = useTransactions({ from: month.from, to: month.to })
  const generate = useGenerateRecurring()

  const [editing, setEditing] = useState<TransactionRow | null>(null)
  const [openAccount, setOpenAccount] = useState<AccountWithBalance | null>(null)

  // The spending cards have their own window, so you can widen it to 90 days
  // without changing the rest of the page.
  const [rangeKey, setRangeKey] = useState<RangeKey>('this_month')
  const spendRange = rangeFor(rangeKey, profile?.week_starts_on ?? 6)
  const insights = useInsights(spendRange.from, spendRange.to, base)

  const forecast = useForecast(base, 45)
  const suggestions = useBudgetSuggestions(base)
  const subscriptions = useSubscriptions(base)
  const unusual = useUnusual(spendRange.from, spendRange.to, base)
  const trends = useCategoryTrends(base, 6)
  const uncategorized = useUncategorized()

  const upcoming = (recurring.data ?? [])
    .filter((r) => !r.archived && daysUntil(r.next_occurrence_on) <= 14)
    .slice(0, 5)
  const due = (recurring.data ?? []).filter((r) => !r.archived && daysUntil(r.next_occurrence_on) <= 0)

  const chartData = (cashflow.data ?? []).map((p) => ({
    label: bucketLabel(p.bucket_start, 'month'),
    income: p.income_minor / 10 ** (currencies?.[base]?.decimal_digits ?? 2),
    expense: p.expense_minor / 10 ** (currencies?.[base]?.decimal_digits ?? 2),
  }))

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------ hero */}
      <section>
        <p className="text-sm muted">Everything you have, in {base}</p>
        {netWorth.isLoading
          ? <div className="skeleton mt-1.5 h-12 w-64" />
          : (
            <div className="mt-0.5">
              <Money
                minor={netWorth.data?.net_minor ?? 0}
                currency={base}
                size="hero"
                tone={(netWorth.data?.net_minor ?? 0) < 0 ? 'debit' : 'plain'}
              />
            </div>
          )}

        {netWorth.data?.missing_rate && (
          <p className="mt-2 flex items-start gap-1.5 text-xs" style={{ color: 'var(--warn)' }}>
            <TriangleAlert size={14} className="mt-px shrink-0" />
            Some accounts are in a currency with no exchange rate saved, so they are left out of this total.{' '}
            <Link to="/settings" className="underline underline-offset-2">Add a rate</Link>
          </p>
        )}
      </section>

      {/* ------------------------------------------------- safe to spend */}
      {forecast.isLoading ? <div className="skeleton h-72" />
       : forecast.data ? <SafeToSpend data={forecast.data} /> : null}

      {/* -------------------------------------------------------- advice */}
      <AdviceFeed
        currency={base}
        suggestions={suggestions.data ?? []}
        subscriptions={subscriptions.data ?? []}
        unusual={unusual.data ?? []}
        trends={trends.data ?? []}
        uncategorized={uncategorized.data}
      />

      {/* ----------------------------------------------------- due banner */}
      {due.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3"
          style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn)' }}
        >
          <CalendarClock size={18} style={{ color: 'var(--warn)' }} />
          <p className="flex-1 text-sm">
            {due.length} planned payment{due.length === 1 ? ' is' : 's are'} due.
          </p>
          <Button
            onClick={async () => {
              try {
                const n = await generate.mutateAsync(today())
                toast(n === 0 ? 'Nothing was due' : `${n} posted`)
              } catch (e) { toast(humanizeError(e), 'error') }
            }}
            loading={generate.isPending}
          >
            Post them
          </Button>
        </div>
      )}

      {/* --------------------------------------------------------- accounts */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-[0.9375rem] font-semibold">Accounts</h2>
          <Link to="/accounts" className="text-sm muted underline underline-offset-2">All accounts</Link>
        </div>
        {accounts.isLoading ? <div className="skeleton h-20" /> : (
          <div className="scroll-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {(accounts.data ?? []).map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setOpenAccount(a)}
                className="panel tinted min-w-[9.5rem] shrink-0 px-3.5 py-3 text-left transition-colors"
                style={{ '--tint': a.color } as CSSProperties}
              >
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: a.color }} aria-hidden />
                  <span className="truncate text-sm font-medium">{a.name}</span>
                </div>
                <div className="mt-1">
                  <Money
                    minor={a.balance?.balance_minor ?? 0}
                    currency={a.currency_code}
                    size="lg"
                    tone={(a.balance?.balance_minor ?? 0) < 0 ? 'debit' : 'plain'}
                    compactZeros
                  />
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* --------------------------------------------------------- spending */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[0.9375rem] font-semibold">Spending</h2>
          <Segmented
            value={rangeKey}
            onChange={setRangeKey}
            options={[
              { value: 'this_month' as RangeKey, label: RANGE_LABELS.this_month },
              { value: 'last_month' as RangeKey, label: RANGE_LABELS.last_month },
              { value: 'last_30' as RangeKey, label: '30 days' },
              { value: 'last_90' as RangeKey, label: '90 days' },
            ]}
          />
        </div>

        {insights.isLoading ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((i) => <div key={i} className="skeleton h-24" />)}
            </div>
            <div className="skeleton h-72" />
          </div>
        ) : insights.isError ? (
          <ErrorNote error={insights.error} retry={() => insights.refetch()} />
        ) : insights.data ? (
          <>
            <PeriodTiles data={insights.data} />
            <SpendingByCategories data={insights.data} />
            <div className="grid gap-3 lg:grid-cols-2">
              <TopPayees data={insights.data} />
              <BiggestExpenses data={insights.data} />
            </div>
          </>
        ) : null}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* --------------------------------------------------- cashflow */}
        <section className="panel px-4 py-4">
          <h2 className="mb-3 text-[0.9375rem] font-semibold">Cash Flow (Last 6 Months)</h2>
          {cashflow.isLoading ? <div className="skeleton h-48" /> : (
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                  <CartesianGrid vertical={false} stroke="var(--rule)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false}
                         tick={{ fontSize: 11, fill: 'var(--ink-muted)' }} />
                  <YAxis tickLine={false} axisLine={false} width={54}
                         tick={{ fontSize: 11, fill: 'var(--ink-muted)' }}
                         tickFormatter={(v: number) =>
                           formatCompact(Math.round(v * 10 ** (currencies?.[base]?.decimal_digits ?? 2)), currencies?.[base])} />
                  <Tooltip
                    cursor={{ fill: 'var(--surface-sunk)' }}
                    contentStyle={{
                      background: 'var(--surface)', border: '1px solid var(--rule-strong)',
                      borderRadius: 10, fontSize: 13, color: 'var(--ink)',
                    }}
                    formatter={(v: number, n: string) => [
                      formatCompact(Math.round(v * 10 ** (currencies?.[base]?.decimal_digits ?? 2)), currencies?.[base]),
                      n === 'income' ? 'In' : 'Out',
                    ]}
                  />
                  <Bar dataKey="income" fill="var(--credit)" radius={[3, 3, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="expense" fill="var(--debit)" radius={[3, 3, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* ---------------------------------------------------- budgets */}
        <section className="panel px-4 py-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[0.9375rem] font-semibold">Budgets</h2>
            <Link to="/budgets" className="text-sm muted underline underline-offset-2">Manage</Link>
          </div>
          {budgets.isLoading ? <div className="skeleton h-24" />
           : (budgets.data?.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm muted">
              No budgets yet. <Link to="/budgets" className="underline underline-offset-2">Set one up</Link>
            </p>
          ) : (
            <div className="space-y-3.5">
              {budgets.data!.slice(0, 4).map((b) => {
                const left = b.amount_minor - b.spent_minor
                return (
                  <div key={b.budget_id}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate">{b.name}</span>
                      <span className={left < 0 ? 'debit' : 'muted'}>
                        <Money minor={Math.abs(left)} currency={b.currency_code} size="sm"
                               tone={left < 0 ? 'debit' : 'muted'} />
                        {left < 0 ? ' over' : ' left'}
                      </span>
                    </div>
                    <Meter value={b.spent_minor} max={b.amount_minor} height={6} />
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {/* -------------------------------------------------------- upcoming */}
      {upcoming.length > 0 && (
        <section className="panel overflow-hidden">
          <div className="flex items-baseline justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--rule)' }}>
            <h2 className="text-[0.9375rem] font-semibold">Coming up</h2>
            <Link to="/planned" className="text-sm muted underline underline-offset-2">All plans</Link>
          </div>
          {upcoming.map((r) => (
            <div key={r.id} className="row-rule flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="text-xs muted">{dueLabel(r.next_occurrence_on)}</p>
              </div>
              <Money minor={r.amount_minor} currency={r.currency_code}
                     tone={r.type === 'income' ? 'credit' : 'debit'} />
            </div>
          ))}
        </section>
      )}

      {/* ---------------------------------------------------------- recent */}
      <section className="panel overflow-hidden">
        <div className="flex items-baseline justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--rule)' }}>
          <h2 className="text-[0.9375rem] font-semibold">This month</h2>
          <Link to="/transactions" className="text-sm muted underline underline-offset-2">All transactions</Link>
        </div>
        {recent.isLoading ? <SkeletonRows rows={5} />
         : (recent.data?.pages[0]?.length ?? 0) === 0 ? (
          <EmptyState
            title="No transactions this month"
            body="Press N anywhere, or use the add button, to record the first one."
          />
        ) : (
          <TransactionList
            rows={recent.data!.pages.flat().slice(0, 12)}
            onPick={setEditing}
          />
        )}
      </section>

      <TransactionDialog open={Boolean(editing)} existing={editing} onClose={() => setEditing(null)} />
      <AccountSheet account={openAccount} onClose={() => setOpenAccount(null)} />
    </div>
  )
}