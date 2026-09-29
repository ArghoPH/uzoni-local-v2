import { useEffect, useState } from 'react'
import { useCurrencies } from '@/hooks/useReference'
import { formatMoney, parseAmount } from '@/lib/money'

/**
 * Types like a text box, stores like an integer. Accepts "1,250.50", "12.5k",
 * "2l" (lakh), Bengali digits — and shows what it understood underneath so a
 * wrong guess is visible before it is saved.
 */
export function AmountInput({
  valueMinor, onChange, currency, autoFocus, id, placeholder = '0.00',
}: {
  valueMinor: number | null
  onChange: (minor: number | null) => void
  currency: string
  autoFocus?: boolean
  id?: string
  placeholder?: string
}) {
  const { data: currencies } = useCurrencies()
  const cur = currencies?.[currency]
  const digits = cur?.decimal_digits ?? 2

  const [text, setText] = useState(() =>
    valueMinor == null ? '' : formatMoney(valueMinor, cur, { symbol: false }))
  const [touched, setTouched] = useState(false)

  // Keep in step when the form loads an existing transaction.
  useEffect(() => {
    if (touched) return
    setText(valueMinor == null ? '' : formatMoney(valueMinor, cur, { symbol: false }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueMinor, currency])

  const parsed = parseAmount(text, digits)
  const showEcho = text.trim() !== '' && parsed != null &&
    formatMoney(parsed, cur, { symbol: false }) !== text.trim()

  return (
    <div>
      <div className="relative">
        <span className="cur-sym pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg muted">
          {cur?.symbol ?? currency}
        </span>
        <input
          id={id}
          inputMode="decimal"
          autoFocus={autoFocus}
          className="field !py-3 !pl-9 !text-2xl font-semibold fig"
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            setTouched(true)
            setText(e.target.value)
            onChange(parseAmount(e.target.value, digits))
          }}
          onBlur={() => {
            const v = parseAmount(text, digits)
            if (v != null) setText(formatMoney(v, cur, { symbol: false }))
          }}
        />
      </div>
      {showEcho && (
        <p className="mt-1 text-xs muted">
          Reads as {formatMoney(parsed, cur)}
        </p>
      )}
      {text.trim() !== '' && parsed == null && (
        <p className="mt-1 text-xs debit">That is not a number Uzoni can read.</p>
      )}
    </div>
  )
}
