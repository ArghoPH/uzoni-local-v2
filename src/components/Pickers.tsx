import { Select } from '@/components/ui'
import { buildTree } from '@/hooks/useCategories'
import type { Account, AccountWithBalance, Category, CategoryKind } from '@/lib/types'

export function AccountSelect({
  value, onChange, accounts, placeholder = 'Select an account', exclude, id, disabled,
}: {
  value: string | null
  onChange: (id: string) => void
  accounts: (Account | AccountWithBalance)[] | undefined
  placeholder?: string
  exclude?: string | null
  id?: string
  disabled?: boolean
}) {
  return (
    <Select id={id} value={value ?? ''} disabled={disabled}
            onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>{placeholder}</option>
      {(accounts ?? [])
        .filter((a) => a.id !== exclude)
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} · {a.currency_code}
          </option>
        ))}
    </Select>
  )
}

export function CategorySelect({
  value, onChange, categories, kind, id, allowNone = true,
}: {
  value: string | null
  onChange: (id: string | null) => void
  categories: Category[] | undefined
  kind: CategoryKind
  id?: string
  allowNone?: boolean
}) {
  const tree = buildTree(categories, kind)
  return (
    <Select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {allowNone && <option value="">Uncategorized</option>}
      {tree.map((parent) => (
        <optgroup key={parent.id} label={parent.name}>
          <option value={parent.id}>{parent.name} (general)</option>
          {parent.children.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </optgroup>
      ))}
    </Select>
  )
}

export function CurrencySelect({
  value, onChange, currencies, id,
}: {
  value: string
  onChange: (code: string) => void
  currencies: Record<string, { code: string; name: string; symbol: string }> | undefined
  id?: string
}) {
  const list = Object.values(currencies ?? {})
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {list.map((c) => (
        <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
      ))}
    </Select>
  )
}
