import { Fragment, useMemo } from 'react'
import { ArrowLeftRight, ArrowDownLeft, ArrowUpRight, Clock, Ban } from 'lucide-react'
import clsx from 'clsx'
import { Money } from '@/components/Money'
import { dayHeading } from '@/lib/dates'
import { signedAmount } from '@/lib/money'
import type { TransactionRow } from '@/lib/types'

export function TransactionList({
  rows, onPick, forAccountId, selectable, selected, onToggle, showRunningDayTotal = true,
}: {
  rows: TransactionRow[]
  onPick?: (row: TransactionRow) => void
  forAccountId?: string
  selectable?: boolean
  selected?: Set<string>
  onToggle?: (id: string) => void
  showRunningDayTotal?: boolean
}) {
  const groups = useMemo(() => {
    const map = new Map<string, TransactionRow[]>()
    for (const r of rows) {
      const list = map.get(r.occurred_on)
      if (list) list.push(r)
      else map.set(r.occurred_on, [r])
    }
    return [...map.entries()]
  }, [rows])

  return (
    <div>
      {groups.map(([day, items]) => (
        <Fragment key={day}>
          <div
            className="sticky top-0 z-10 flex items-baseline justify-between px-4 py-1.5 text-xs font-medium"
            style={{ background: 'var(--surface-sunk)', color: 'var(--ink-muted)' }}
          >
            <span>{dayHeading(day)}</span>
            {showRunningDayTotal && <DayTotal items={items} forAccountId={forAccountId} />}
          </div>

          {items.map((r) => {
            const delta = signedAmount(r, forAccountId)
            const inbound = delta > 0
            const currency = inbound && r.type === 'transfer'
              ? r.transfer_account?.currency_code ?? r.currency_code
              : r.currency_code

            const title = r.type === 'transfer'
              ? `${r.account?.name ?? 'Account'} → ${r.transfer_account?.name ?? 'Account'}`
              : r.payee || r.category?.name || (r.type === 'income' ? 'Income' : 'Expense')

            const sub = r.type === 'transfer'
              ? (r.note || 'Transfer')
              : [r.category?.name ?? 'Uncategorized', r.account?.name].filter(Boolean).join(' · ')

            const isSelected = selected?.has(r.id) ?? false

            return (
              <div
                key={r.id}
                className={clsx(
                  'row-rule flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                  (onPick || selectable) && 'cursor-pointer hover:bg-[var(--surface-sunk)]',
                )}
                style={isSelected ? { background: 'var(--accent-soft)' } : undefined}
                onClick={() => (selectable && onToggle ? onToggle(r.id) : onPick?.(r))}
                role={onPick || selectable ? 'button' : undefined}
                tabIndex={onPick || selectable ? 0 : undefined}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    selectable && onToggle ? onToggle(r.id) : onPick?.(r)
                  }
                }}
              >
                {selectable && (
                  <input
                    type="checkbox" checked={isSelected} readOnly
                    className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                    aria-label={`Select ${title}`}
                  />
                )}

                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                  style={{
                    background: r.type === 'transfer' ? 'var(--surface-sunk)'
                      : `${(r.category?.color ?? '#8E8E93')}1f`,
                    color: r.type === 'transfer' ? 'var(--ink-muted)' : (r.category?.color ?? '#8E8E93'),
                  }}
                  aria-hidden
                >
                  {r.type === 'transfer' ? <ArrowLeftRight size={16} />
                    : r.type === 'income' ? <ArrowDownLeft size={16} />
                    : <ArrowUpRight size={16} />}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[0.9375rem] font-medium">{title}</span>
                    {r.status === 'pending' && (
                      <Clock size={12} className="shrink-0" style={{ color: 'var(--warn)' }} aria-label="Pending" />
                    )}
                    {r.status === 'void' && (
                      <Ban size={12} className="shrink-0 muted" aria-label="Void" />
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[0.8125rem] muted">{sub}</span>
                </span>

                <Money
                  minor={delta}
                  currency={currency}
                  tone={r.status === 'void' ? 'muted' : inbound ? 'credit' : 'debit'}
                  signed={inbound}
                  className={clsx('shrink-0 tabular-nums', r.status === 'void' && 'line-through')}
                />
              </div>
            )
          })}
        </Fragment>
      ))}
    </div>
  )
}

function DayTotal({ items, forAccountId }: { items: TransactionRow[]; forAccountId?: string }) {
  // Only meaningful when everything that day shares a currency.
  const currencies = new Set(items.map((i) => i.currency_code))
  if (currencies.size !== 1) return null
  const total = items
    .filter((i) => i.status !== 'void')
    .reduce((sum, i) => sum + signedAmount(i, forAccountId), 0)
  if (total === 0) return null
  return <Money minor={total} currency={[...currencies][0]} size="sm" signed tone="auto" />
}
