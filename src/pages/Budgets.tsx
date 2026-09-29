import { useEffect, useState } from 'react'
import { PiggyBank, Plus } from 'lucide-react'
import {
  Button, ConfirmDialog, EmptyState, ErrorNote, Field, Input, Meter, Modal,
  Select, SkeletonRows, useToast,
} from '@/components/ui'
import { AmountInput } from '@/components/AmountInput'
import { CurrencySelect } from '@/components/Pickers'
import { Money } from '@/components/Money'
import {
  useBudgetProgress, useBudgets, useBudgetScope, useDeleteBudget, useSaveBudget,
} from '@/hooks/usePlanning'
import { useCategories } from '@/hooks/useCategories'
import { useAccounts } from '@/hooks/useAccounts'
import { useCurrencies, useProfile } from '@/hooks/useReference'
import { humanizeError } from '@/lib/api'
import { shortDate, today } from '@/lib/dates'
import type { Budget, BudgetPeriod } from '@/lib/types'

const PERIODS: { value: BudgetPeriod; label: string }[] = [
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
  { value: 'quarterly', label: 'Every quarter' },
  { value: 'yearly', label: 'Every year' },
  { value: 'one_time', label: 'One time only' },
]

export function Budgets() {
  const ref = today()
  const budgets = useBudgets()
  const progress = useBudgetProgress(ref)
  const [editing, setEditing] = useState<Budget | null>(null)
  const [creating, setCreating] = useState(false)

  const byId = new Map((budgets.data ?? []).map((b) => [b.id, b]))

  return (
    <div>
      <header className="mb-4 flex items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold tracking-tight">Budgets</h1>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus size={15} /> New budget
        </Button>
      </header>

      {progress.isLoading ? <SkeletonRows rows={3} />
       : progress.isError ? <ErrorNote error={progress.error} retry={() => progress.refetch()} />
       : (progress.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<PiggyBank size={28} />}
          title="No budgets running"
          body="Set a ceiling for a category — groceries, transport, eating out — and Uzoni tracks what is left."
          action={<Button variant="primary" onClick={() => setCreating(true)}>Create a budget</Button>}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {progress.data!.map((p) => {
            const left = p.amount_minor - p.spent_minor
            const over = left < 0
            const pct = p.amount_minor > 0 ? Math.round((p.spent_minor / p.amount_minor) * 100) : 0
            return (
              <button
                key={p.budget_id}
                className="panel px-5 py-4 text-left"
                onClick={() => setEditing(byId.get(p.budget_id) ?? null)}
              >
                <div className="flex items-baseline gap-2">
                  <span className="flex-1 truncate font-medium">{p.name}</span>
                  <span className="fig text-sm muted">{pct}%</span>
                </div>

                <div className="mt-2.5">
                  <Meter value={p.spent_minor} max={p.amount_minor} tone={pct > 85 ? 'warn' : 'accent'} />
                </div>

                <div className="mt-2.5 flex items-baseline justify-between gap-3">
                  <span className="text-sm">
                    <Money minor={p.spent_minor} currency={p.currency_code} tone="plain" />
                    <span className="muted"> of </span>
                    <Money minor={p.amount_minor} currency={p.currency_code} tone="muted" />
                  </span>
                  <span className={`text-sm font-medium ${over ? 'debit' : 'credit'}`}>
                    <Money minor={Math.abs(left)} currency={p.currency_code} tone={over ? 'debit' : 'credit'} />
                    {over ? ' over' : ' left'}
                  </span>
                </div>

                <p className="mt-1.5 text-xs muted">
                  {shortDate(p.win_start)} – {shortDate(p.win_end)}
                </p>
                {p.missing_rate && (
                  <p className="mt-1 text-xs" style={{ color: 'var(--warn)' }}>
                    Some spending is in another currency with no exchange rate saved, so it is not counted.
                  </p>
                )}
              </button>
            )
          })}
        </div>
      )}

      <BudgetDialog open={creating} onClose={() => setCreating(false)} />
      <BudgetDialog open={Boolean(editing)} existing={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function BudgetDialog({
  open, onClose, existing,
}: { open: boolean; onClose: () => void; existing?: Budget | null }) {
  const toast = useToast()
  const save = useSaveBudget()
  const remove = useDeleteBudget()
  const { data: categories } = useCategories()
  const { data: accounts } = useAccounts()
  const { data: currencies } = useCurrencies()
  const { data: profile } = useProfile()
  const scope = useBudgetScope(existing?.id ?? null)

  const [name, setName] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [currency, setCurrency] = useState('BDT')
  const [period, setPeriod] = useState<BudgetPeriod>('monthly')
  const [startsOn, setStartsOn] = useState(today())
  const [endsOn, setEndsOn] = useState('')
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [accountIds, setAccountIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setName(existing?.name ?? '')
    setAmount(existing?.amount_minor ?? null)
    setCurrency(existing?.currency_code ?? profile?.base_currency ?? 'BDT')
    setPeriod(existing?.period ?? 'monthly')
    setStartsOn(existing?.starts_on ?? today())
    setEndsOn(existing?.ends_on ?? '')
    setCategoryIds([])
    setAccountIds([])
  }, [open, existing, profile?.base_currency])

  useEffect(() => {
    if (scope.data) { setCategoryIds(scope.data.categoryIds); setAccountIds(scope.data.accountIds) }
  }, [scope.data])

  async function submit() {
    setError(null)
    if (!name.trim()) return setError('Give the budget a name.')
    if (!amount || amount <= 0) return setError('Set an amount above zero.')
    if (period === 'one_time' && !endsOn) return setError('A one-time budget needs an end date.')
    try {
      await save.mutateAsync({
        id: existing?.id,
        name: name.trim(), amount_minor: amount, currency_code: currency,
        period, starts_on: startsOn, ends_on: endsOn || null,
        categoryIds, accountIds,
      })
      toast(existing ? 'Budget updated' : 'Budget created')
      onClose()
    } catch (e) { setError(humanizeError(e)) }
  }

  return (
    <>
      <Modal
        open={open} onClose={onClose} wide
        title={existing ? 'Edit budget' : 'New budget'}
        footer={
          <>
            {existing && (
              <Button variant="quiet" className="mr-auto debit" onClick={() => setConfirming(true)}>Delete</Button>
            )}
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={submit} loading={save.isPending}>
              {existing ? 'Save changes' : 'Create budget'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Groceries, eating out…" />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount" required>
              <AmountInput valueMinor={amount} onChange={setAmount} currency={currency} />
            </Field>
            <Field label="Currency">
              <CurrencySelect value={currency} onChange={setCurrency} currencies={currencies} />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Repeats">
              <Select value={period} onChange={(e) => setPeriod(e.target.value as BudgetPeriod)}>
                {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </Select>
            </Field>
            <Field label="Starts" required>
              <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </Field>
            <Field label="Ends" hint={period === 'one_time' ? 'Required' : 'Optional'}>
              <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </Field>
          </div>

          <div>
            <p className="mb-2 text-[0.8125rem] font-medium soft">Categories counted</p>
            <p className="mb-2 text-xs muted">
              Pick none to count all spending. Picking a parent also counts everything inside it.
            </p>
            <div className="scroll-thin max-h-48 overflow-y-auto pr-1">
              <div className="flex flex-wrap gap-2">
                {(categories ?? []).filter((c) => c.kind === 'expense' && !c.parent_id && !c.archived).map((c) => (
                  <button key={c.id} type="button" className="chip" data-on={categoryIds.includes(c.id)}
                          onClick={() => setCategoryIds((p) => p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id])}>
                    <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-[0.8125rem] font-medium soft">Accounts counted</p>
            <p className="mb-2 text-xs muted">Pick none to count every account.</p>
            <div className="flex flex-wrap gap-2">
              {(accounts ?? []).map((a) => (
                <button key={a.id} type="button" className="chip" data-on={accountIds.includes(a.id)}
                        onClick={() => setAccountIds((p) => p.includes(a.id) ? p.filter((x) => x !== a.id) : [...p, a.id])}>
                  <span className="h-2 w-2 rounded-full" style={{ background: a.color }} />
                  {a.name}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-lg px-3 py-2 text-sm debit" style={{ background: 'var(--debit-soft)' }}>{error}</p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirming} onClose={() => setConfirming(false)}
        busy={remove.isPending}
        onConfirm={async () => {
          if (!existing) return
          try {
            await remove.mutateAsync(existing.id)
            toast('Budget deleted'); setConfirming(false); onClose()
          } catch (e) { setError(humanizeError(e)); setConfirming(false) }
        }}
        title={`Delete ${existing?.name}?`}
        body="The budget goes away. Your transactions are untouched."
      />
    </>
  )
}
