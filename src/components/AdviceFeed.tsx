import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  CircleAlert, Inbox, PiggyBank, Repeat, TrendingUp, X,
} from 'lucide-react'
import { Button, useLocalState, useToast } from '@/components/ui'
import { Money } from '@/components/Money'
import { useSaveBudget, useSaveRecurring } from '@/hooks/usePlanning'
import { humanizeError } from '@/lib/api'
import { shortDate, startOfMonthIso } from '@/lib/dates'
import type {
  BudgetSuggestion, CategoryTrend, RecurrenceFreq, Subscription,
  UncategorizedSummary, UnusualExpense,
} from '@/lib/types'

const CADENCE_TO_FREQ: Record<string, RecurrenceFreq> = {
  weekly: 'weekly', biweekly: 'biweekly', monthly: 'monthly',
  quarterly: 'quarterly', yearly: 'yearly', daily: 'daily',
}

interface Props {
  currency: string
  suggestions: BudgetSuggestion[]
  subscriptions: Subscription[]
  unusual: UnusualExpense[]
  trends: CategoryTrend[]
  uncategorized: UncategorizedSummary | undefined
}

/**
 * Turns every detection into one sentence and, where possible, one button.
 * A finding that cannot be acted on is just another number to feel bad about,
 * so anything listed here either creates something or links somewhere.
 */
export function AdviceFeed({
  currency, suggestions, subscriptions, unusual, trends, uncategorized,
}: Props) {
  const toast = useToast()
  const saveBudget = useSaveBudget()
  const saveRecurring = useSaveRecurring()
  const [dismissed, setDismissed] = useLocalState<string[]>('uzoni.advice.dismissed', [])

  const hide = (key: string) => setDismissed((prev) => [...new Set([...prev, key])])
  const visible = (key: string) => !dismissed.includes(key)

  const rising = useMemo(
    () => trends.filter((t) => t.direction === 'rising' && t.change_pct >= 25).slice(0, 2),
    [trends],
  )

  const cards: { key: string; node: React.ReactNode }[] = []

  /* ------------------------------------------------------- uncategorized */
  if (uncategorized && uncategorized.count > 0) {
    cards.push({
      key: 'uncategorized',
      node: (
        <Card
          icon={<Inbox size={16} />}
          tone="warn"
          title={`${uncategorized.count} transaction${uncategorized.count === 1 ? '' : 's'} with no category`}
          body={
            <>
              Worth <Money minor={uncategorized.amount_minor} currency={currency} tone="plain" size="sm" />,
              {uncategorized.oldest_on && <> going back to {shortDate(uncategorized.oldest_on)}.</>}
              {' '}Until they are filed they are missing from every report below.
            </>
          }
          action={
            <Link to="/transactions" className="btn btn-ghost">Sort them out</Link>
          }
        />
      ),
    })
  }

  /* ---------------------------------------------------------- overspend */
  for (const t of rising) {
    const key = `rising:${t.category_id}:${t.change_pct}`
    if (!visible(key)) continue
    cards.push({
      key,
      node: (
        <Card
          icon={<TrendingUp size={16} />}
          tone="debit"
          swatch={t.color}
          title={`${t.category_name} is climbing`}
          body={
            <>
              Up {t.change_pct}% over the last three months compared with the three before,
              {' '}<Money minor={t.total_minor} currency={currency} tone="plain" size="sm" /> in total.
            </>
          }
          action={<Link to="/reports" className="btn btn-ghost">See the trend</Link>}
          onDismiss={() => hide(key)}
        />
      ),
    })
  }

  /* -------------------------------------------------- budget suggestions */
  for (const s of suggestions.slice(0, 2)) {
    const key = `budget:${s.category_id}`
    if (!visible(key)) continue
    cards.push({
      key,
      node: (
        <Card
          icon={<PiggyBank size={16} />}
          swatch={s.color}
          title={`Put a budget on ${s.category_name}?`}
          body={
            <>
              You spent <Money minor={s.average_minor} currency={currency} tone="plain" size="sm" /> a
              month on average over the last {s.months_observed} months, peaking at{' '}
              <Money minor={s.highest_minor} currency={currency} tone="plain" size="sm" />.
            </>
          }
          action={
            <Button
              variant="primary"
              loading={saveBudget.isPending}
              onClick={async () => {
                try {
                  await saveBudget.mutateAsync({
                    name: s.category_name,
                    amount_minor: s.suggested_minor,
                    currency_code: currency,
                    period: 'monthly',
                    starts_on: startOfMonthIso(),
                    categoryIds: [s.category_id],
                  })
                  toast(`Budget set for ${s.category_name}`)
                  hide(key)
                } catch (e) { toast(humanizeError(e), 'error') }
              }}
            >
              Budget <Money minor={s.suggested_minor} currency={currency} tone="plain" size="sm" className="!text-inherit" />
            </Button>
          }
          onDismiss={() => hide(key)}
        />
      ),
    })
  }

  /* --------------------------------------------------------- subscriptions */
  for (const sub of subscriptions.slice(0, 3)) {
    const key = `sub:${sub.payee}`
    if (!visible(key)) continue
    cards.push({
      key,
      node: (
        <Card
          icon={<Repeat size={16} />}
          tone={sub.price_crept ? 'warn' : undefined}
          title={
            sub.price_crept
              ? `${sub.payee} costs ${sub.price_change_pct}% more than it did`
              : `${sub.payee} looks like a subscription`
          }
          body={
            <>
              <Money minor={sub.last_amount_minor} currency={currency} tone="plain" size="sm" />{' '}
              {sub.cadence}, {sub.occurrences} times so far — about{' '}
              <Money minor={sub.yearly_cost_minor} currency={currency} tone="debit" size="sm" /> a year.
              {' '}Next one around {shortDate(sub.next_expected_on)}.
            </>
          }
          action={
            <Button
              loading={saveRecurring.isPending}
              onClick={async () => {
                try {
                  await saveRecurring.mutateAsync({
                    name: sub.payee,
                    type: 'expense',
                    account_id: sub.account_id,
                    category_id: sub.category_id,
                    amount_minor: sub.last_amount_minor,
                    currency_code: currency,
                    payee: sub.payee,
                    freq: CADENCE_TO_FREQ[sub.cadence] ?? 'monthly',
                    interval_count: 1,
                    starts_on: sub.next_expected_on,
                    next_occurrence_on: sub.next_expected_on,
                    auto_create: false,
                  })
                  toast(`${sub.payee} added to planned payments`)
                  hide(key)
                } catch (e) { toast(humanizeError(e), 'error') }
              }}
            >
              Track it
            </Button>
          }
          onDismiss={() => hide(key)}
        />
      ),
    })
  }

  /* ------------------------------------------------------------- unusual */
  for (const u of unusual.slice(0, 2)) {
    const key = `unusual:${u.id}`
    if (!visible(key)) continue
    cards.push({
      key,
      node: (
        <Card
          icon={<CircleAlert size={16} />}
          swatch={u.color}
          title={`${u.payee || u.category_name} was ${u.times_typical}× the usual`}
          body={
            <>
              <Money minor={u.amount_minor} currency={u.currency_code} tone="debit" size="sm" /> on{' '}
              {shortDate(u.occurred_on)}, against a typical{' '}
              <Money minor={u.median_minor} currency={currency} tone="plain" size="sm" /> for {u.category_name}.
            </>
          }
          onDismiss={() => hide(key)}
        />
      ),
    })
  }

  if (cards.length === 0) return null

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[0.9375rem] font-semibold">Worth knowing</h2>
        {dismissed.length > 0 && (
          <button className="text-xs muted underline underline-offset-2"
                  onClick={() => setDismissed([])}>
            Bring back dismissed
          </button>
        )}
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {cards.map((c) => <div key={c.key}>{c.node}</div>)}
      </div>
    </section>
  )
}

function Card({
  icon, title, body, action, onDismiss, tone, swatch,
}: {
  icon: React.ReactNode
  title: string
  body: React.ReactNode
  action?: React.ReactNode
  onDismiss?: () => void
  tone?: 'warn' | 'debit'
  swatch?: string
}) {
  const accent = swatch ?? (tone === 'debit' ? 'var(--debit)' : tone === 'warn' ? 'var(--warn)' : 'var(--accent)')
  return (
    <div className="panel flex h-full flex-col px-4 py-3.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full"
              style={{ background: `color-mix(in srgb, ${accent} 14%, var(--surface))`, color: accent }}>
          {icon}
        </span>
        <p className="min-w-0 flex-1 text-sm font-medium">{title}</p>
        {onDismiss && (
          <button onClick={onDismiss} className="btn btn-quiet -mr-2 -mt-1 px-1.5" aria-label="Dismiss">
            <X size={14} />
          </button>
        )}
      </div>
      <p className="mt-1.5 pl-[2.375rem] text-[0.8125rem] muted">{body}</p>
      {action && <div className="mt-3 pl-[2.375rem]">{action}</div>}
    </div>
  )
}
