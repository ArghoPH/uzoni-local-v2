import clsx from 'clsx'
import { useCurrencies } from '@/hooks/useReference'
import { formatMoney } from '@/lib/money'
import type { FormatOptions } from '@/lib/money'

/**
 * Every amount in the app renders through here, so figures stay in one
 * tabular column and the credit/debit colours never drift apart.
 */
export function Money({
  minor, currency, tone = 'auto', className, size = 'md', ...opts
}: FormatOptions & {
  minor: number
  currency: string
  tone?: 'auto' | 'plain' | 'credit' | 'debit' | 'muted'
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero'
}) {
  const { data: currencies } = useCurrencies()
  const cur = currencies?.[currency]

  // The symbol gets its own element so .cur-sym can give it its own font,
  // size and spacing without touching the figures beside it.
  const withSign = formatMoney(minor, cur, { ...opts, symbol: false })
  const sign = /^[+-]/.test(withSign) ? withSign[0] : ''
  const figures = sign ? withSign.slice(1) : withSign
  const symbol = cur?.symbol ?? currency
  const showSymbol = opts.symbol !== false

  const toneClass =
    tone === 'credit' ? 'credit'
    : tone === 'debit' ? 'debit'
    : tone === 'muted' ? 'muted'
    : tone === 'auto' ? (minor > 0 ? 'credit' : minor < 0 ? 'debit' : 'muted')
    : ''

  const sizeClass = {
    sm: 'text-[0.8125rem]',
    md: 'text-[0.9375rem]',
    lg: 'text-lg font-semibold',
    xl: 'text-2xl font-semibold',
    hero: 'text-[2.6rem] leading-none font-semibold sm:text-[3.25rem]',
  }[size]

  return (
    <span className={clsx('fig', sizeClass, toneClass, className)}>
      {sign}
      {showSymbol && <span className="cur-sym">{symbol}</span>}
      {figures}
    </span>
  )
}
