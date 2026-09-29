import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CalendarClock, TriangleAlert } from 'lucide-react'
import { Money } from '@/components/Money'
import { useCurrencies } from '@/hooks/useReference'
import { formatCompact, formatMoney } from '@/lib/money'
import { dueLabel, shortDate } from '@/lib/dates'
import type { Forecast } from '@/lib/types'

/**
 * The one number the whole app exists to produce: what today can cost without
 * breaking the rest of the month. Committed money — planned payments due
 * before the next income, and anything already sitting in savings goals — is
 * taken off first, then the remainder is spread evenly across the days left.
 */
export function SafeToSpend({ data }: { data: Forecast }) {
  const { data: currencies } = useCurrencies()
  const cur = currencies?.[data.currency]
  const digits = cur?.decimal_digits ?? 2
  const toMajor = (minor: number) => minor / 10 ** digits

  const broke = data.available_minor <= 0
  const series = data.series.map((p) => ({ date: p.date, balance: toMajor(p.balance_minor) }))

  return (
    <section className="panel overflow-hidden">
      <div className="px-5 pb-4 pt-4">
        <p className="text-sm muted">
          {broke ? 'Nothing spare' : 'You can spend'}
          {data.next_income
            ? <> until {shortDate(data.next_income.occurs_on)}, when {data.next_income.name} arrives</>
            : <> until {shortDate(data.until)}</>}
        </p>

        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Money
            minor={data.safe_per_day_minor}
            currency={data.currency}
            size="hero"
            tone={broke ? 'debit' : 'plain'}
          />
          <span className="text-sm muted">a day</span>
        </div>

        {broke ? (
          <p className="mt-2 text-sm debit">
            Everything you have is already spoken for by planned payments and savings goals.
            Something has to move before there is room to spend.
          </p>
        ) : (
          <p className="mt-2 text-sm muted">
            <Money minor={data.available_minor} currency={data.currency} tone="plain" size="sm" />
            {' '}spare over {data.days_until} day{data.days_until === 1 ? '' : 's'}.
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-xs muted">
          <span>
            In accounts <Money minor={data.balance_minor} currency={data.currency} tone="plain" size="sm" />
          </span>
          {data.committed_minor > 0 && (
            <span>
              Committed <Money minor={data.committed_minor} currency={data.currency} tone="debit" size="sm" />
            </span>
          )}
          {data.reserved_minor > 0 && (
            <span>
              In goals <Money minor={data.reserved_minor} currency={data.currency} tone="plain" size="sm" />
            </span>
          )}
          {data.burn_days_observed > 0 && (
            <span>
              Usual spend <Money minor={data.daily_burn_minor} currency={data.currency} tone="plain" size="sm" /> a day
              {!data.burn_confident && <> · only {data.burn_days_observed} day{data.burn_days_observed === 1 ? '' : 's'} of history</>}
            </span>
          )}
        </div>

        {data.runway_on && (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg px-3 py-2 text-sm"
             style={{ background: 'var(--debit-soft)', color: 'var(--debit)' }}>
            <TriangleAlert size={15} className="mt-0.5 shrink-0" />
            <span>
              At this rate the money runs out on <strong>{shortDate(data.runway_on)}</strong>
              {data.runway_days != null && <> — {data.runway_days} days away</>}.
            </span>
          </p>
        )}

        {data.missing_rate && (
          <p className="mt-2 flex items-start gap-1.5 text-xs" style={{ color: 'var(--warn)' }}>
            <TriangleAlert size={13} className="mt-px shrink-0" />
            An account is in a currency with no saved exchange rate, so it is not counted here.
          </p>
        )}
      </div>

      <div className="px-2 pb-2">
        <p className="px-3 pb-1 text-xs muted">
          Balance from today to {shortDate(data.horizon_to)}
        </p>
        <div style={{ height: 150 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 4, right: 12, bottom: 0, left: -8 }}>
              <defs>
                <linearGradient id="runwayFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={40}
                     tick={{ fontSize: 11, fill: 'var(--ink-muted)' }}
                     tickFormatter={(d: string) => shortDate(d).replace(/ \d{4}$/, '')} />
              <YAxis tickLine={false} axisLine={false} width={52}
                     tick={{ fontSize: 11, fill: 'var(--ink-muted)' }}
                     tickFormatter={(v: number) => formatCompact(Math.round(v * 10 ** digits), cur)} />
              <ReferenceLine y={0} stroke="var(--debit)" strokeDasharray="3 3" />
              {/* Where the spending window closes, so the chart and the number
                  above it are visibly talking about the same date. */}
              <ReferenceLine
                x={data.until}
                stroke="var(--ink-muted)"
                strokeDasharray="4 4"
                label={{
                  value: data.next_income ? data.next_income.name : 'Month end',
                  position: 'insideTopRight',
                  fontSize: 11,
                  fill: 'var(--ink-muted)',
                }}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface)', border: '1px solid var(--rule-strong)',
                  borderRadius: 10, fontSize: 13, color: 'var(--ink)',
                }}
                labelFormatter={(d: string) => shortDate(d)}
                formatter={(v: number) => [formatMoney(Math.round(v * 10 ** digits), cur), 'Balance']}
              />
              <Area type="monotone" dataKey="balance" stroke="var(--accent)" strokeWidth={2}
                    fill="url(#runwayFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {data.upcoming.length > 0 && (
        <div style={{ borderTop: '1px solid var(--rule)' }}>
          <div className="flex items-center gap-2 px-5 py-2.5">
            <CalendarClock size={15} className="muted" />
            <span className="text-xs font-medium soft">Already committed</span>
          </div>
          {data.upcoming.map((u) => (
            <div key={`${u.rule_id}-${u.occurs_on}`}
                 className="row-rule flex items-center gap-3 px-5 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">{u.name}</span>
              <span className="text-xs muted">{dueLabel(u.occurs_on)}</span>
              <Money minor={u.amount_minor} currency={data.currency} tone="debit" size="sm" />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}