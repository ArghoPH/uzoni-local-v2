import { useEffect, useRef, useState } from 'react'
import { Input, useDebounced } from '@/components/ui'
import { Money } from '@/components/Money'
import { usePayeeSuggestions } from '@/hooks/useAdvisor'
import { shortDate } from '@/lib/dates'
import type { PayeeSuggestion } from '@/lib/types'

/**
 * A payee field that remembers. Picking a past payee fills in the category and
 * the usual amount, because the same shop almost always means the same kind of
 * spending — which is most of the typing in a manual finance app.
 */
export function PayeeInput({
  value, onChange, onPick, placeholder, id,
}: {
  value: string
  onChange: (v: string) => void
  onPick: (s: PayeeSuggestion) => void
  placeholder?: string
  id?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const wrapper = useRef<HTMLDivElement>(null)

  const search = useDebounced(value, 200)
  const { data: suggestions } = usePayeeSuggestions(search, open)
  const list = suggestions ?? []

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const choose = (s: PayeeSuggestion) => {
    onChange(s.payee)
    onPick(s)
    setOpen(false)
    setActive(-1)
  }

  return (
    <div ref={wrapper} className="relative">
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1) }}
        onKeyDown={(e) => {
          if (!open || list.length === 0) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % list.length) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + list.length) % list.length) }
          else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(list[active]) }
          else if (e.key === 'Escape') { setOpen(false); setActive(-1) }
        }}
      />

      {open && list.length > 0 && (
        <div
          className="scroll-thin absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl py-1"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--rule-strong)',
            boxShadow: '0 12px 30px rgba(12,14,20,.18)',
          }}
          role="listbox"
        >
          {list.map((s, i) => (
            <button
              key={s.payee}
              type="button"
              role="option"
              aria-selected={i === active}
              className="flex w-full items-center gap-3 px-3 py-2 text-left"
              style={i === active ? { background: 'var(--surface-sunk)' } : undefined}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(s)}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{s.payee}</span>
                <span className="block truncate text-xs muted">
                  {s.category_name ?? 'Uncategorized'} · {s.use_count}× · last {shortDate(s.last_used_on)}
                </span>
              </span>
              <Money minor={s.amount_minor} currency={s.currency_code} size="sm" tone="muted" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
