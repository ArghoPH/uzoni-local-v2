import { useMemo, useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Download } from 'lucide-react'
import { Button, EmptyState, ErrorNote, Field, Input, Segmented, SkeletonRows } from '@/components/ui'
import { Money } from '@/components/Money'
import { CategoryTrends, SpendingHeatmap } from '@/components/Trends'
import { useCashflow, useCategoryTotals } from '@/hooks/useReports'
import { useCategoryTrends } from '@/hooks/useAdvisor'
import { useCurrencies, useProfile } from '@/hooks/useReference'
import { bucketFor, bucketLabel, RANGE_LABELS, rangeFor, shortDate } from '@/lib/dates'
import type { RangeKey } from '@/lib/dates'
import { formatCompact, formatMoney } from '@/lib/money'
import { downloadCsv, toCsv } from '@/lib/csv'
import type { CategoryKind } from '@/lib/types'

export function Reports() {
  const { data: profile } = useProfile()
  const { data: currencies } = useCurrencies()
  const base = profile?.base_currency ?? 'BDT'
  const digits = currencies?.[base]?.decimal_digits ?? 2

  const [rangeKey, setRangeKey] = useState<RangeKey>('last_90')
  const [custom, setCustom] = useState(rangeFor('last_90'))
  const [kind, setKind] = useState<CategoryKind>('expense')

  const range = rangeKey === 'custom' ? custom : rangeFor(rangeKey, profile?.week_starts_on ?? 6)
  const bucket = bucketFor(range)

  const totals = useCategoryTotals(range.from, range.to, base, kind)
  const cashflow = useCashflow(range.from, range.to, base, bucket)
  const trends = useCategoryTrends(base, 6)
  // The heatmap always wants days, whatever bucket the charts above are using.
  const daily = useCashflow(range.from, range.to, base, 'day')

  const toMajor = (minor: number) => minor / 10 ** digits

  const pieData = useMemo(
    () => (totals.data ?? []).filter((t) => t.total_minor > 0).slice(0, 9),
    [totals.data],
  )
  const grandTotal = useMemo(
    () => (totals.data ?? []).reduce((s, t) => s + t.total_minor, 0),
    [totals.data],
  )

  const flowData = (cashflow.data ?? []).map((p) => ({
    label: bucketLabel(p.bucket_start, bucket),
    In: toMajor(p.income_minor),
    Out: toMajor(p.expense_minor),
    Net: toMajor(p.net_minor),
  }))

  const tooltipStyle = {
    background: 'var(--surface)', border: '1px solid var(--rule-strong)',
    borderRadius: 10, fontSize: 13, color: 'var(--ink)',
  }
  const axisTick = { fontSize: 11, fill: 'var(--ink-muted)' }
  const fmtAxis = (v: number) => formatCompact(Math.round(v * 10 ** digits), currencies?.[base])

  function exportBreakdown() {
    const csv = toCsv(
      ['Category', `Total (${base})`, 'Transactions', 'Share'],
      (totals.data ?? []).map((t) => [
        t.category_name,
        (t.total_minor / 10 ** digits).toFixed(digits),
        t.txn_count,
        grandTotal ? `${((t.total_minor / grandTotal) * 100).toFixed(1)}%` : '0%',
      ]),
    )
    downloadCsv(`uzoni-${kind}-${range.from}-to-${range.to}.csv`, csv)
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold tracking-tight">Reports</h1>
        <Button onClick={exportBreakdown} disabled={!totals.data?.length}>
          <Download size={15} /> Export
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={rangeKey} onChange={setRangeKey}
          options={[
            { value: 'this_month' as RangeKey, label: RANGE_LABELS.this_month },
            { value: 'last_90' as RangeKey, label: '90 days' },
            { value: 'this_year' as RangeKey, label: RANGE_LABELS.this_year },
            { value: 'custom' as RangeKey, label: 'Custom' },
          ]}
        />
        <Segmented
          value={kind} onChange={setKind}
          options={[
            { value: 'expense' as CategoryKind, label: 'Spending', tone: 'debit' },
            { value: 'income' as CategoryKind, label: 'Income', tone: 'credit' },
          ]}
        />
      </div>

      {rangeKey === 'custom' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="From">
            <Input type="date" value={custom.from}
                   onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
          </Field>
          <Field label="To">
            <Input type="date" value={custom.to}
                   onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          </Field>
        </div>
      )}

      {/* ---------------------------------------------------------- flow */}
      <section className="panel px-4 py-4">
        <h2 className="mb-1 text-[0.9375rem] font-semibold">Money in and out</h2>
        <p className="mb-3 text-xs muted">
          {shortDate(range.from)} – {shortDate(range.to)}, grouped by {bucket}
        </p>
        {cashflow.isLoading ? <div className="skeleton h-56" />
         : cashflow.isError ? <ErrorNote error={cashflow.error} retry={() => cashflow.refetch()} />
         : (
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={flowData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                <CartesianGrid vertical={false} stroke="var(--rule)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
                <YAxis tickLine={false} axisLine={false} width={56} tick={axisTick} tickFormatter={fmtAxis} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-sunk)' }}
                         formatter={(v: number) => fmtAxis(v)} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'var(--ink-muted)' }} />
                <Bar dataKey="In" fill="var(--credit)" radius={[3, 3, 0, 0]} maxBarSize={26} />
                <Bar dataKey="Out" fill="var(--debit)" radius={[3, 3, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* --------------------------------------------------- running net */}
      <section className="panel px-4 py-4">
        <h2 className="mb-3 text-[0.9375rem] font-semibold">Net per {bucket}</h2>
        <div style={{ height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={flowData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="netFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--rule)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
              <YAxis tickLine={false} axisLine={false} width={56} tick={axisTick} tickFormatter={fmtAxis} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtAxis(v)} />
              <Area type="monotone" dataKey="Net" stroke="var(--accent)" strokeWidth={2} fill="url(#netFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* --------------------------------------------------------- trends */}
      {trends.isLoading
        ? <div className="skeleton h-64" />
        : <CategoryTrends trends={trends.data ?? []} currency={base} months={6} />}

      {/* -------------------------------------------------------- heatmap */}
      {daily.isLoading
        ? <div className="skeleton h-40" />
        : <SpendingHeatmap
            points={daily.data ?? []}
            currency={base}
            weekStartsOn={profile?.week_starts_on ?? 6}
          />}

      {/* ------------------------------------------------------ breakdown */}
      <section className="panel overflow-hidden">
        <div className="px-4 py-4" style={{ borderBottom: '1px solid var(--rule)' }}>
          <h2 className="text-[0.9375rem] font-semibold">
            {kind === 'expense' ? 'Where it went' : 'Where it came from'}
          </h2>
          <p className="mt-0.5 text-sm muted">
            Total <Money minor={grandTotal} currency={base} tone={kind === 'expense' ? 'debit' : 'credit'} />
          </p>
        </div>

        {totals.isLoading ? <SkeletonRows rows={6} />
         : totals.isError ? <ErrorNote error={totals.error} retry={() => totals.refetch()} />
         : pieData.length === 0 ? (
          <EmptyState title="Nothing in this range" body="Try a wider date range." />
        ) : (
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,300px)_1fr]">
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData} dataKey="total_minor" nameKey="category_name"
                    innerRadius="58%" outerRadius="88%" paddingAngle={2} stroke="none"
                  >
                    {pieData.map((d) => <Cell key={d.category_name} fill={d.color} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v: number, n: string) => [formatMoney(v, currencies?.[base]), n]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div>
              {(totals.data ?? []).map((t) => {
                const share = grandTotal ? (t.total_minor / grandTotal) * 100 : 0
                return (
                  <div key={`${t.category_id}-${t.category_name}`} className="row-rule py-2.5">
                    <div className="flex items-baseline gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm">{t.category_name}</span>
                      <span className="fig text-xs muted">{share.toFixed(1)}%</span>
                      <Money minor={t.total_minor} currency={base} tone="plain" />
                    </div>
                    <div className="mt-1.5 ml-4.5 h-1 overflow-hidden rounded-full"
                         style={{ background: 'var(--surface-sunk)' }}>
                      <div className="h-full rounded-full" style={{ width: `${share}%`, background: t.color }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
