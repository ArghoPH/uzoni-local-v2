import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Upload } from 'lucide-react'
import {
  Button, ConfirmDialog, Field, Input, Modal, Segmented, Select, SkeletonRows, useToast,
} from '@/components/ui'
import { AccountSelect, CategorySelect, CurrencySelect } from '@/components/Pickers'
import { ColorPicker, DEFAULT_SWATCHES } from '@/components/ColorPicker'
import { Money } from '@/components/Money'
import {
  useCurrencies, useDeleteRate, useProfile, useRates, useSaveRate, useUpdateProfile,
} from '@/hooks/useReference'
import { useAccounts } from '@/hooks/useAccounts'
import {
  buildTree, useCategories, useCreateCategory, useDeleteCategory, useUpdateCategory,
} from '@/hooks/useCategories'
import { useCreateTransaction } from '@/hooks/useTransactions'
import { parseCsv } from '@/lib/csv'
import { parseAmount } from '@/lib/money'
import { humanizeError } from '@/lib/api'
import { shortDate, today } from '@/lib/dates'
import type { Category, CategoryKind } from '@/lib/types'

type Tab = 'general' | 'categories' | 'currencies' | 'import'

export function Settings() {
  const [tab, setTab] = useState<Tab>('general')
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold tracking-tight">Settings</h1>
      <Segmented
        value={tab} onChange={setTab} className="mb-5"
        options={[
          { value: 'general' as Tab, label: 'General' },
          { value: 'categories' as Tab, label: 'Categories' },
          { value: 'currencies' as Tab, label: 'Currencies' },
          { value: 'import' as Tab, label: 'Import' },
        ]}
      />
      {tab === 'general' && <General />}
      {tab === 'categories' && <Categories />}
      {tab === 'currencies' && <Currencies />}
      {tab === 'import' && <ImportCsv />}
    </div>
  )
}

/* ---------------------------------------------------------------- general */

function General() {
  const toast = useToast()
  const { data: profile } = useProfile()
  const { data: currencies } = useCurrencies()
  const update = useUpdateProfile()
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('BDT')
  const [weekStart, setWeekStart] = useState(6)
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system')

  useEffect(() => {
    if (!profile) return
    setName(profile.display_name ?? '')
    setCurrency(profile.base_currency)
    setWeekStart(profile.week_starts_on)
    setTheme(profile.theme)
  }, [profile])

  async function save() {
    try {
      await update.mutateAsync({
        display_name: name.trim() || null,
        base_currency: currency,
        week_starts_on: weekStart,
        theme,
      })
      toast('Settings saved')
    } catch (e) { toast(humanizeError(e), 'error') }
  }

  return (
    <div className="max-w-lg space-y-4">
      <Field label="Your name">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>

      <Field label="Main currency"
             hint="Totals across accounts are converted into this. Exchange rates come from the Currencies tab.">
        <CurrencySelect value={currency} onChange={setCurrency} currencies={currencies} />
      </Field>

      <Field label="Week starts on">
        <Select value={weekStart} onChange={(e) => setWeekStart(Number(e.target.value))}>
          {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
            .map((d, i) => <option key={d} value={i}>{d}</option>)}
        </Select>
      </Field>

      <Field label="Theme">
        <Segmented
          value={theme} onChange={setTheme}
          options={[
            { value: 'light' as const, label: 'Light' },
            { value: 'dark' as const, label: 'Dark' },
            { value: 'system' as const, label: 'Match system' },
          ]}
        />
      </Field>

      <Button variant="primary" onClick={save} loading={update.isPending}>Save settings</Button>

      <div className="pt-4" style={{ borderTop: '1px solid var(--rule)' }}>
        <p className="text-sm font-medium">Your data</p>
        <p className="mt-1 text-sm muted">
          Everything lives in the PostgreSQL database on this computer. Nothing is sent anywhere,
          and you can open the same database in pgAdmin or DBeaver whenever you want to look at
          the raw rows. Export a copy from the Transactions page, and back the database up with
          <code className="mx-1">pg_dump</code>.
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- categories */

function Categories() {
  const { data: categories, isLoading } = useCategories()
  const [kind, setKind] = useState<CategoryKind>('expense')
  const [editing, setEditing] = useState<Category | null>(null)
  const [creating, setCreating] = useState<{ parentId: string | null } | null>(null)

  const tree = useMemo(() => buildTree(categories, kind), [categories, kind])

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center gap-2">
        <Segmented
          value={kind} onChange={setKind}
          options={[
            { value: 'expense' as CategoryKind, label: 'Expense', tone: 'debit' },
            { value: 'income' as CategoryKind, label: 'Income', tone: 'credit' },
          ]}
        />
        <Button className="ml-auto" variant="primary" onClick={() => setCreating({ parentId: null })}>
          <Plus size={15} /> New group
        </Button>
      </div>

      {isLoading ? <SkeletonRows rows={6} /> : (
        <div className="panel overflow-hidden">
          {tree.map((parent) => (
            <div key={parent.id} className="row-rule">
              <div className="flex items-center gap-2.5 px-4 py-3">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: parent.color }} aria-hidden />
                <button className="flex-1 text-left font-medium" onClick={() => setEditing(parent)}>
                  {parent.name}
                </button>
                <Button variant="quiet" onClick={() => setCreating({ parentId: parent.id })}>
                  <Plus size={14} /> Subcategory
                </Button>
              </div>
              {parent.children.length > 0 && (
                <div className="pb-1 pl-11 pr-4">
                  <div className="flex flex-wrap gap-1.5 pb-2">
                    {parent.children.map((c) => (
                      <button key={c.id} className="chip" onClick={() => setEditing(c)}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <CategoryDialog
        open={Boolean(creating)} onClose={() => setCreating(null)}
        kind={kind} parentId={creating?.parentId ?? null}
      />
      <CategoryDialog
        open={Boolean(editing)} onClose={() => setEditing(null)}
        kind={kind} existing={editing}
      />
    </div>
  )
}


function CategoryDialog({
  open, onClose, kind, parentId, existing,
}: {
  open: boolean; onClose: () => void; kind: CategoryKind
  parentId?: string | null; existing?: Category | null
}) {
  const toast = useToast()
  const create = useCreateCategory()
  const update = useUpdateCategory()
  const remove = useDeleteCategory()
  const [name, setName] = useState('')
  const [color, setColor] = useState(DEFAULT_SWATCHES[0])
  const [archived, setArchived] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setName(existing?.name ?? '')
    setColor(existing?.color ?? DEFAULT_SWATCHES[0])
    setArchived(existing?.archived ?? false)
  }, [open, existing])

  async function submit() {
    setError(null)
    if (!name.trim()) return setError('Give the category a name.')
    try {
      if (existing) {
        await update.mutateAsync({ id: existing.id, name: name.trim(), color, archived })
        toast('Category updated')
      } else {
        await create.mutateAsync({ name: name.trim(), kind, color, parent_id: parentId ?? null })
        toast('Category added')
      }
      onClose()
    } catch (e) { setError(humanizeError(e)) }
  }

  return (
    <>
      <Modal
        open={open} onClose={onClose}
        title={existing ? 'Edit category' : parentId ? 'New subcategory' : 'New category group'}
        footer={
          <>
            {existing && !existing.is_system && (
              <Button variant="quiet" className="mr-auto debit" onClick={() => setConfirming(true)}>Delete</Button>
            )}
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={submit} loading={create.isPending || update.isPending}>
              {existing ? 'Save changes' : 'Add category'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="Colour">
            <ColorPicker value={color} onChange={setColor} />
          </Field>
          {existing && (
            <label className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)}
                     className="h-4 w-4 accent-[var(--accent)]" />
              Hide from pickers
            </label>
          )}
          {error && <p className="rounded-lg px-3 py-2 text-sm debit" style={{ background: 'var(--debit-soft)' }}>{error}</p>}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirming} onClose={() => setConfirming(false)} busy={remove.isPending}
        onConfirm={async () => {
          if (!existing) return
          try {
            await remove.mutateAsync(existing.id)
            toast('Category deleted'); setConfirming(false); onClose()
          } catch (e) { setError(humanizeError(e)); setConfirming(false) }
        }}
        title={`Delete ${existing?.name}?`}
        body="Transactions in this category become uncategorized. Subcategories are deleted too."
      />
    </>
  )
}

/* -------------------------------------------------------------- currencies */

function Currencies() {
  const toast = useToast()
  const { data: currencies } = useCurrencies()
  const { data: profile } = useProfile()
  const rates = useRates()
  const saveRate = useSaveRate()
  const deleteRate = useDeleteRate()

  const base = profile?.base_currency ?? 'BDT'
  const [from, setFrom] = useState('USD')
  const [rate, setRate] = useState('')
  const [asOf, setAsOf] = useState(today())

  async function submit() {
    const value = Number(rate)
    if (!Number.isFinite(value) || value <= 0) return toast('Enter a rate above zero', 'error')
    try {
      await saveRate.mutateAsync({ base_code: from, quote_code: base, rate: value, as_of: asOf })
      toast('Rate saved')
      setRate('')
    } catch (e) { toast(humanizeError(e), 'error') }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <p className="text-sm soft">
          Uzoni never guesses an exchange rate. Save the rate you actually got and every total
          across currencies uses it — anything without a rate is left out and flagged.
        </p>
      </div>

      <div className="panel px-4 py-4">
        <p className="mb-3 text-[0.9375rem] font-semibold">Add a rate</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <Field label="From">
            <CurrencySelect value={from} onChange={setFrom} currencies={currencies} />
          </Field>
          <div className="flex items-end pb-2.5 text-sm muted">→ {base}</div>
          <Field label={`1 ${from} equals`}>
            <Input
              inputMode="decimal" value={rate} placeholder="122.50"
              onChange={(e) => setRate(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-3 flex items-end gap-3">
          <Field label="Effective from" className="flex-1">
            <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </Field>
          <Button variant="primary" onClick={submit} loading={saveRate.isPending}>Save rate</Button>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <p className="px-4 py-3 text-[0.9375rem] font-semibold" style={{ borderBottom: '1px solid var(--rule)' }}>
          Saved rates
        </p>
        {rates.isLoading ? <SkeletonRows rows={3} />
         : (rates.data?.length ?? 0) === 0
           ? <p className="px-4 py-6 text-center text-sm muted">No rates saved yet.</p>
           : rates.data!.map((r) => (
          <div key={r.id} className="row-rule flex items-center gap-3 px-4 py-3">
            <span className="flex-1 text-sm">
              1 {r.base_code} = <span className="fig">{r.rate}</span> {r.quote_code}
            </span>
            <span className="text-xs muted">from {shortDate(r.as_of)}</span>
            <button className="btn btn-quiet px-1.5" aria-label="Delete rate"
                    onClick={() => deleteRate.mutate(r.id)}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ import */

interface Mapping { date: number; amount: number; payee: number; note: number; category: number }

function ImportCsv() {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const { data: accounts } = useAccounts()
  const { data: currencies } = useCurrencies()
  const { data: allCategories } = useCategories()
  const create = useCreateTransaction()

  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [map, setMap] = useState<Mapping>({ date: -1, amount: -1, payee: -1, note: -1, category: -1 })
  const [accountId, setAccountId] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ ok: number; failed: number } | null>(null)

  const account = accounts?.find((a) => a.id === accountId)
  const digits = currencies?.[account?.currency_code ?? 'BDT']?.decimal_digits ?? 2

  function guess(names: string[], candidates: string[]): number {
    const lower = names.map((n) => n.toLowerCase())
    for (const c of candidates) {
      const i = lower.findIndex((n) => n.includes(c))
      if (i >= 0) return i
    }
    return -1
  }

  async function onFile(file: File) {
    const text = await file.text()
    const parsed = parseCsv(text)
    setHeaders(parsed.headers)
    setRows(parsed.rows)
    setResult(null)
    setMap({
      date: guess(parsed.headers, ['date', 'time', 'tarikh']),
      amount: guess(parsed.headers, ['amount', 'value', 'taka', 'debit', 'credit']),
      payee: guess(parsed.headers, ['payee', 'description', 'details', 'merchant', 'particular']),
      note: guess(parsed.headers, ['note', 'memo', 'remark', 'comment']),
      category: guess(parsed.headers, ['category', 'type']),
    })
  }

  const preview = useMemo(() => rows.slice(0, 5), [rows])

  async function run() {
    if (!accountId) return toast('Pick the account these belong to', 'error')
    if (map.date < 0 || map.amount < 0) return toast('Map at least the date and amount columns', 'error')

    setRunning(true)
    let ok = 0, failed = 0

    for (const r of rows) {
      const rawDate = r[map.date]?.trim()
      const minor = parseAmount(r[map.amount] ?? '', digits)
      if (!rawDate || minor == null || minor === 0) { failed++; continue }

      const date = normalizeDate(rawDate)
      if (!date) { failed++; continue }

      try {
        await create.mutateAsync({
          type: minor < 0 ? 'expense' : 'income',
          account_id: accountId,
          category_id: categoryId,
          amount_minor: Math.abs(minor),
          currency_code: account!.currency_code,
          occurred_on: date,
          payee: map.payee >= 0 ? (r[map.payee]?.trim() || null) : null,
          note: map.note >= 0 ? (r[map.note]?.trim() || null) : null,
        })
        ok++
      } catch { failed++ }
    }

    setRunning(false)
    setResult({ ok, failed })
    toast(`Imported ${ok} row${ok === 1 ? '' : 's'}${failed ? `, skipped ${failed}` : ''}`)
  }

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm soft">
        Bring in a statement or a spreadsheet. A negative amount becomes an expense, a positive one
        becomes income. Nothing is written until you press Import.
      </p>

      <input
        ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f) }}
      />
      <Button onClick={() => fileRef.current?.click()}>
        <Upload size={15} /> Choose a CSV file
      </Button>

      {headers.length > 0 && (
        <>
          <div className="panel px-4 py-4">
            <p className="mb-3 text-[0.9375rem] font-semibold">
              Match the columns · {rows.length} row{rows.length === 1 ? '' : 's'} found
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                ['date', 'Date'], ['amount', 'Amount'],
                ['payee', 'Paid to / received from'], ['note', 'Note'],
              ] as [keyof Mapping, string][]).map(([key, label]) => (
                <Field key={key} label={label}>
                  <Select
                    value={map[key]}
                    onChange={(e) => setMap((m) => ({ ...m, [key]: Number(e.target.value) }))}
                  >
                    <option value={-1}>Not in this file</option>
                    {headers.map((h, i) => <option key={`${h}-${i}`} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </Select>
                </Field>
              ))}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Import into account" required>
                <AccountSelect value={accountId} onChange={setAccountId} accounts={accounts} />
              </Field>
              <Field label="Set every row to this category" hint="Optional — recategorize later in bulk.">
                <CategorySelect value={categoryId} onChange={setCategoryId} categories={allCategories} kind="expense" />
              </Field>
            </div>
          </div>

          <div className="panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                  <th className="px-3 py-2 text-left font-medium muted">Date</th>
                  <th className="px-3 py-2 text-left font-medium muted">Payee</th>
                  <th className="px-3 py-2 text-right font-medium muted">Amount</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => {
                  const minor = parseAmount(r[map.amount] ?? '', digits)
                  return (
                    <tr key={i} className="row-rule">
                      <td className="px-3 py-2">{normalizeDate(r[map.date] ?? '') ?? <span className="debit">unreadable</span>}</td>
                      <td className="px-3 py-2">{map.payee >= 0 ? r[map.payee] : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        {minor == null
                          ? <span className="debit">unreadable</span>
                          : <Money minor={minor} currency={account?.currency_code ?? 'BDT'} signed />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <Button variant="primary" onClick={run} loading={running} disabled={!accountId}>
            Import {rows.length} row{rows.length === 1 ? '' : 's'}
          </Button>

          {result && (
            <p className="text-sm">
              <span className="credit">{result.ok} imported</span>
              {result.failed > 0 && <span className="muted"> · {result.failed} skipped because the date or amount could not be read</span>}
            </p>
          )}
        </>
      )}
    </div>
  )
}

/** Accepts 2026-09-29, 29/09/2026, 29-09-2026, 09/29/2026 and a few near misses. */
function normalizeDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)

  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (m) {
    let [, a, b, y] = m
    if (y.length === 2) y = `20${y}`
    // Day first unless the first number cannot be a day.
    const day = Number(a) > 12 ? a : Number(b) > 12 ? b : a
    const month = day === a ? b : a
    const d = new Date(Number(y), Number(month) - 1, Number(day))
    if (!Number.isNaN(d.getTime())) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  const parsed = new Date(s)
  if (Number.isNaN(parsed.getTime())) return null
  // Format from local parts: toISOString would move the date a day for anyone
  // in a timezone ahead of UTC.
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`
}
