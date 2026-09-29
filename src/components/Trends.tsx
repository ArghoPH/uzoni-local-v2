import { useMemo } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { Money } from '@/components/Money'
import { EmptyState } from '@/components/ui'
import { useCurrencies } from '@/hooks/useReference'
import { formatMoney } from '@/lib/money'
import { monthLabel, parseDate, shortDate } from '@/lib/dates'
import type { CashflowPoint, CategoryTrend } from '@/lib/types'

/* --------------------------------------------------------------- sparkline */

/**
 * Six months of one category, drawn small. Bars rather than a line, because a
 * line implies a continuous quantity and these are six separate months.
 */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1)
  const width = 92
  const gap = 3
  const barWidth = (width - gap * (values.length - 1)) / values.length

  return (
    <svg width={width} height={28} viewBox={`0 0 ${width} 28`} aria-hidden className="shrink-0">
      {values.map((v, i) => {
        const height = Math.max(1.5, (v / max) * 26)
        return (
          <rect
            key={i}
            x={i * (barWidth + gap)}
            y={28 - height}
            width={barWidth}
            height={height}
            rx={1.5}
            fill={color}
            opacity={i === values.length - 1 ? 1 : 0.35}
          />
        )
      })}
    </svg>
  )
}

export function CategoryTrends({
  trends, currency, months = 6,
}: { trends: CategoryTrend[]; currency: string; months?: number }) {
  if (trends.length === 0) {
    return (
      <section className="panel">
        <EmptyState
          title="Not enough history yet"
          body="After a couple of months the trend for each category appears here."
        />
      </section>
    )
  }

  return (
    <section className="panel overflow-hidden">
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--rule)' }}>
        <h2 className="text-[0.9375rem] font-semibold">What is getting more expensive</h2>
        <p className="mt-0.5 text-xs muted">
          Last {months} months. The change compares the recent half with the half before it, so a
          single quiet month does not flip the verdict.
        </p>
      </div>

      {trends.map((t) => {
        const last = t.series[t.series.length - 1]
        const Icon = t.direction === 'rising' ? ArrowUpRight
          : t.direction === 'falling' ? ArrowDownRight : Minus
        const color = t.direction === 'rising' ? 'var(--debit)'
          : t.direction === 'falling' ? 'var(--credit)' : 'var(--ink-muted)'

        return (
          <div key={`${t.category_id}-${t.category_name}`}
               className="row-rule flex items-center gap-3 px-4 py-3">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{t.category_name}</span>
              <span className="block text-xs muted">
                {monthLabel(last.month)}{' '}
                <Money minor={last.total_minor} currency={currency} size="sm" tone="muted" />
              </span>
            </span>

            <Sparkline values={t.series.map((s) => s.total_minor)} color={t.color} />

            <span className="flex w-20 shrink-0 items-center justify-end gap-1 text-sm fig"
                  style={{ color }}>
              <Icon size={14} />
              {t.direction === 'steady' ? 'steady' : `${Math.abs(t.change_pct)}%`}
            </span>
          </div>
        )
      })}
    </section>
  )
}

/* ----------------------------------------------------------------- heatmap */

/**
 * A calendar of spending days. Patterns that no total can show — every Friday,
 * or the three days after payday — are obvious the moment they are laid out as
 * days rather than summed into a month.
 */
export function SpendingHeatmap({
  points, currency, weekStartsOn = 6,
}: { points: CashflowPoint[]; currency: string; weekStartsOn?: number }) {
  const { data: currencies } = useCurrencies()
  const cur = currencies?.[currency]

  const { weeks, max, dayNames } = useMemo(() => {
    const byDate = new Map(points.map((p) => [p.bucket_start, p.expense_minor]))
    const dates = points.map((p) => p.bucket_start).sort()
    if (dates.length === 0) return { weeks: [], max: 0, dayNames: [] }

    const first = parseDate(dates[0])!
    const last = parseDate(dates[dates.length - 1])!

    // Back up to the start of the containing week so columns line up.
    const start = new Date(first)
    while (start.getDay() !== weekStartsOn) start.setDate(start.getDate() - 1)

    const cells: { date: string; value: number; inRange: boolean }[] = []
    for (let d = new Date(start); d <= last; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      cells.push({ date: key, value: byDate.get(key) ?? 0, inRange: byDate.has(key) })
    }

    const grouped: typeof cells[] = []
    for (let i = 0; i < cells.length; i += 7) grouped.push(cells.slice(i, i + 7))

    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return {
      weeks: grouped,
      max: Math.max(...cells.map((c) => c.value), 1),
      dayNames: Array.from({ length: 7 }, (_, i) => names[(weekStartsOn + i) % 7]),
    }
  }, [points, weekStartsOn])

  if (weeks.length === 0) {
    return (
      <section className="panel">
        <EmptyState title="Nothing to map yet" body="Days with spending appear here once there are some." />
      </section>
    )
  }

  return (
    <section className="panel px-4 py-4">
      <h2 className="text-[0.9375rem] font-semibold">Spending by day</h2>
      <p className="mt-0.5 text-xs muted">Darker is a heavier day. Hover for the amount.</p>

      <div className="scroll-thin mt-3 overflow-x-auto pb-1">
        <div className="flex gap-[3px]">
          <div className="mr-1 flex flex-col gap-[3px] pt-[1px]">
            {dayNames.map((d) => (
              <span key={d} className="h-3.5 text-[0.6rem] leading-[0.875rem] muted">{d[0]}</span>
            ))}
          </div>

          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((cell) => {
                const intensity = cell.value > 0 ? 12 + Math.round((cell.value / max) * 78) : 0
                return (
                  <span
                    key={cell.date}
                    className="h-3.5 w-3.5 rounded-[3px]"
                    title={`${shortDate(cell.date)} — ${formatMoney(cell.value, cur)}`}
                    style={{
                      background: cell.inRange
                        ? intensity > 0
                          ? `color-mix(in srgb, var(--debit) ${intensity}%, var(--surface-sunk))`
                          : 'var(--surface-sunk)'
                        : 'transparent',
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-[0.7rem] muted">
        <span>Quiet</span>
        {[0, 25, 50, 75, 100].map((i) => (
          <span key={i} className="h-3 w-3 rounded-[3px]"
                style={{ background: `color-mix(in srgb, var(--debit) ${i === 0 ? 0 : 12 + i * 0.78}%, var(--surface-sunk))` }} />
        ))}
        <span>Heavy</span>
      </div>
    </section>
  )
}
