import { useMemo, useState } from 'react'
import { Download, Filter, Search, Tag, Trash2, X } from 'lucide-react'
import {
  Button, EmptyState, ErrorNote, Field, Input, Modal, Segmented, SkeletonRows,
  useDebounced, useToast,
} from '@/components/ui'
import { TransactionList } from '@/components/TransactionList'
import { TransactionDialog } from '@/components/TransactionDialog'
import { CategorySelect } from '@/components/Pickers'
import { useAccounts } from '@/hooks/useAccounts'
import { useCategories } from '@/hooks/useCategories'
import {
  useBulkCategorize, useDeleteTransactions, useTransactions,
} from '@/hooks/useTransactions'
import type { TxnFilters } from '@/hooks/useTransactions'
import { useCurrencies, useProfile } from '@/hooks/useReference'
import { RANGE_LABELS, rangeFor, shortDate } from '@/lib/dates'
import type { RangeKey } from '@/lib/dates'
import { humanizeError } from '@/lib/api'
import type { TransactionRow, TxnType } from '@/lib/types'
import { toCsv, downloadCsv } from '@/lib/csv'

export function Transactions() {
  const toast = useToast()
  const { data: profile } = useProfile()
  const { data: currencies } = useCurrencies()
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()

  const [rangeKey, setRangeKey] = useState<RangeKey>('this_month')
  const [custom, setCustom] = useState(rangeFor('this_month'))
  const [types, setTypes] = useState<TxnType[]>([])
  const [accountIds, setAccountIds] = useState<string[]>([])
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [rawSearch, setRawSearch] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [onlyUncategorized, setOnlyUncategorized] = useState(false)
  const [editing, setEditing] = useState<TransactionRow | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkCategory, setBulkCategory] = useState<string | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)

  const search = useDebounced(rawSearch, 350)
  const range = rangeKey === 'custom' ? custom : rangeFor(rangeKey, profile?.week_starts_on ?? 6)

  const filters: TxnFilters = useMemo(() => ({
    from: range.from, to: range.to,
    types: types.length ? types : undefined,
    accountIds: accountIds.length ? accountIds : undefined,
    categoryIds: categoryIds.length ? categoryIds : undefined,
    search: search || undefined,
    uncategorized: onlyUncategorized || undefined,
  }), [range.from, range.to, types, accountIds, categoryIds, search, onlyUncategorized])

  const q = useTransactions(filters)
  const rows = useMemo(() => q.data?.pages.flat() ?? [], [q.data])

  const bulkDelete = useDeleteTransactions()
  const bulkCategorize = useBulkCategorize()

  const activeFilterCount =
    (types.length ? 1 : 0) + (accountIds.length ? 1 : 0) + (categoryIds.length ? 1 : 0)
    + (onlyUncategorized ? 1 : 0)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function runBulkDelete() {
    try {
      await bulkDelete.mutateAsync([...selected])
      toast(`${selected.size} deleted`)
      setSelected(new Set())
    } catch (e) { toast(humanizeError(e), 'error') }
  }

  async function runBulkCategorize() {
    try {
      await bulkCategorize.mutateAsync({ ids: [...selected], category_id: bulkCategory })
      toast(`${selected.size} recategorized`)
      setSelected(new Set()); setBulkOpen(false)
    } catch (e) { toast(humanizeError(e), 'error') }
  }

  function exportCsv() {
    const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]))
    const categoryName = new Map((categories ?? []).map((c) => [c.id, c.name]))
    const digitsOf = (code: string) => currencies?.[code]?.decimal_digits ?? 2
    const csv = toCsv(
      ['Date', 'Type', 'Amount', 'Currency', 'Account', 'To account', 'Category', 'Payee', 'Note', 'Status'],
      rows.map((r) => [
        r.occurred_on, r.type,
        (r.amount_minor / 10 ** digitsOf(r.currency_code)).toFixed(digitsOf(r.currency_code)),
        r.currency_code,
        accountName.get(r.account_id) ?? '',
        r.transfer_account_id ? accountName.get(r.transfer_account_id) ?? '' : '',
        r.category_id ? categoryName.get(r.category_id) ?? '' : '',
        r.payee ?? '', r.note ?? '', r.status,
      ]),
    )
    downloadCsv(`uzoni-${range.from}-to-${range.to}.csv`, csv)
    toast('CSV downloaded')
  }

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold tracking-tight">Transactions</h1>
        <Button onClick={exportCsv} disabled={!rows.length}>
          <Download size={15} /> Export
        </Button>
        <Button onClick={() => setFiltersOpen(true)}>
          <Filter size={15} /> Filters
          {activeFilterCount > 0 && (
            <span
              className="ml-0.5 rounded-full px-1.5 text-[0.7rem]"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >{activeFilterCount}</span>
          )}
        </Button>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 muted" aria-hidden />
          <Input
            className="!pl-9" placeholder="Search payee or note"
            value={rawSearch} onChange={(e) => setRawSearch(e.target.value)}
          />
          {rawSearch && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-quiet px-1.5"
                    onClick={() => setRawSearch('')} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </div>
        <button type="button" className="chip" data-on={onlyUncategorized}
                onClick={() => setOnlyUncategorized((v) => !v)}>
          No category
        </button>
        <RangeChips value={rangeKey} onChange={setRangeKey} />
      </div>

      {rangeKey === 'custom' && (
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
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

      <div className="panel overflow-hidden">
        {q.isLoading ? <SkeletonRows rows={8} />
         : q.isError ? <ErrorNote error={q.error} retry={() => q.refetch()} />
         : rows.length === 0 ? (
          <EmptyState
            title="Nothing in this range"
            body="Change the dates or filters, or add a transaction with the button in the corner."
          />
        ) : (
          <>
            <TransactionList
              rows={rows}
              onPick={setEditing}
              selectable={selected.size > 0}
              selected={selected}
              onToggle={toggle}
            />
            {q.hasNextPage && (
              <div className="p-3 text-center" style={{ borderTop: '1px solid var(--rule)' }}>
                <Button onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {rows.length > 0 && selected.size === 0 && (
        <p className="mt-3 text-center text-xs muted">
          Showing {rows.length} transaction{rows.length === 1 ? '' : 's'} from{' '}
          {shortDate(range.from)} to {shortDate(range.to)}. Long-press or tap a row to edit it.
        </p>
      )}

      {/* --------------------------------------------------- selection bar */}
      {selected.size > 0 && (
        <div
          className="fixed inset-x-0 bottom-16 z-40 mx-auto flex max-w-lg items-center gap-2 rounded-xl px-3 py-2 lg:bottom-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--rule-strong)', boxShadow: '0 12px 34px rgba(12,14,20,.2)' }}
        >
          <span className="px-1 text-sm font-medium">{selected.size} selected</span>
          <span className="flex-1" />
          <Button onClick={() => setBulkOpen(true)}><Tag size={15} /> Category</Button>
          <Button variant="danger" onClick={runBulkDelete} loading={bulkDelete.isPending}>
            <Trash2 size={15} />
          </Button>
          <Button variant="quiet" onClick={() => setSelected(new Set())} aria-label="Clear selection">
            <X size={16} />
          </Button>
        </div>
      )}

      {/* ------------------------------------------------------- dialogues */}
      <TransactionDialog open={Boolean(editing)} existing={editing} onClose={() => setEditing(null)} />

      <Modal
        open={bulkOpen} onClose={() => setBulkOpen(false)}
        title={`Recategorize ${selected.size} transactions`}
        footer={
          <>
            <Button onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={runBulkCategorize} loading={bulkCategorize.isPending}>
              Apply
            </Button>
          </>
        }
      >
        <Field label="Category" hint="Income transactions are skipped if the category is an expense one.">
          <CategorySelect value={bulkCategory} onChange={setBulkCategory}
                          categories={categories} kind="expense" />
        </Field>
      </Modal>

      <Modal open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters"
             footer={
               <>
                 <Button onClick={() => {
                   setTypes([]); setAccountIds([]); setCategoryIds([]); setOnlyUncategorized(false)
                 }}>
                   Clear all
                 </Button>
                 <Button variant="primary" onClick={() => setFiltersOpen(false)}>Done</Button>
               </>
             }>
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-[0.8125rem] font-medium soft">Type</p>
            <div className="flex flex-wrap gap-2">
              {(['expense', 'income', 'transfer'] as TxnType[]).map((t) => (
                <button key={t} type="button" className="chip capitalize"
                        data-on={types.includes(t)}
                        onClick={() => setTypes((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t])}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[0.8125rem] font-medium soft">Accounts</p>
            <div className="flex flex-wrap gap-2">
              {(accounts ?? []).map((a) => (
                <button key={a.id} type="button" className="chip"
                        data-on={accountIds.includes(a.id)}
                        onClick={() => setAccountIds((p) => p.includes(a.id) ? p.filter((x) => x !== a.id) : [...p, a.id])}>
                  <span className="h-2 w-2 rounded-full" style={{ background: a.color }} />
                  {a.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[0.8125rem] font-medium soft">Categories</p>
            <div className="scroll-thin max-h-56 overflow-y-auto pr-1">
              <div className="flex flex-wrap gap-2">
                {(categories ?? []).filter((c) => !c.parent_id && !c.archived).map((c) => (
                  <button key={c.id} type="button" className="chip"
                          data-on={categoryIds.includes(c.id)}
                          onClick={() => setCategoryIds((p) => p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id])}>
                    <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-2 text-xs muted">
              Picking a parent matches only that parent. Select its children to include them.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function RangeChips({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={[
        { value: 'this_month' as RangeKey, label: RANGE_LABELS.this_month },
        { value: 'last_month' as RangeKey, label: RANGE_LABELS.last_month },
        { value: 'last_90' as RangeKey, label: '90 days' },
        { value: 'custom' as RangeKey, label: 'Custom' },
      ]}
    />
  )
}
