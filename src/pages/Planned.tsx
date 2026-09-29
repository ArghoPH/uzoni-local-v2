import { useEffect, useState } from 'react'
import { CalendarClock, Play, Plus } from 'lucide-react'
import {
  Button, ConfirmDialog, EmptyState, ErrorNote, Field, Input, Modal, Segmented,
  Select, SkeletonRows, Textarea, useToast,
} from '@/components/ui'
import { AmountInput } from '@/components/AmountInput'
import { AccountSelect, CategorySelect } from '@/components/Pickers'
import { Money } from '@/components/Money'
import {
  useDeleteRecurring, useRecurring, useSaveRecurring,
} from '@/hooks/usePlanning'
import { useGenerateRecurring } from '@/hooks/useTransactions'
import { useAccounts } from '@/hooks/useAccounts'
import { useCategories } from '@/hooks/useCategories'
import { humanizeError } from '@/lib/api'
import { daysUntil, dueLabel, shortDate, today } from '@/lib/dates'
import type { RecurrenceFreq, RecurringRule, TxnType } from '@/lib/types'

const FREQ_LABELS: Record<RecurrenceFreq, string> = {
  daily: 'day', weekly: 'week', biweekly: 'two weeks',
  monthly: 'month', quarterly: 'quarter', yearly: 'year',
}

export function Planned() {
  const toast = useToast()
  const q = useRecurring()
  const generate = useGenerateRecurring()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<RecurringRule | null>(null)

  const due = (q.data ?? []).filter((r) => !r.archived && daysUntil(r.next_occurrence_on) <= 0)

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold tracking-tight">Planned payments</h1>
        {due.length > 0 && (
          <Button
            onClick={async () => {
              try {
                const n = await generate.mutateAsync(today())
                toast(n === 0 ? 'Nothing was due' : `${n} transaction${n === 1 ? '' : 's'} posted`)
              } catch (e) { toast(humanizeError(e), 'error') }
            }}
            loading={generate.isPending}
          >
            <Play size={15} /> Post {due.length} due
          </Button>
        )}
        <Button variant="primary" onClick={() => setCreating(true)}><Plus size={15} /> New plan</Button>
      </header>

      {q.isLoading ? <SkeletonRows rows={3} />
       : q.isError ? <ErrorNote error={q.error} retry={() => q.refetch()} />
       : (q.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<CalendarClock size={28} />}
          title="Nothing scheduled"
          body="Rent, salary, the internet bill — set them once and Uzoni posts them on time."
          action={<Button variant="primary" onClick={() => setCreating(true)}>Add a planned payment</Button>}
        />
      ) : (
        <div className="panel overflow-hidden">
          {q.data!.map((r) => {
            const overdue = daysUntil(r.next_occurrence_on) < 0
            return (
              <button
                key={r.id}
                onClick={() => setEditing(r)}
                className="row-rule flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-[var(--surface-sunk)]"
                style={r.archived ? { opacity: 0.5 } : undefined}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.name}</p>
                  <p className="mt-0.5 text-xs muted">
                    Every {r.interval_count > 1 ? `${r.interval_count} ` : ''}{FREQ_LABELS[r.freq]}
                    {r.interval_count > 1 && !FREQ_LABELS[r.freq].endsWith('s') ? 's' : ''}
                    {' · '}
                    <span style={overdue ? { color: 'var(--warn)' } : undefined}>
                      {r.archived ? 'Paused' : dueLabel(r.next_occurrence_on)}
                    </span>
                    {!r.auto_create && ' · reminder only'}
                    {r.ends_on && ` · until ${shortDate(r.ends_on)}`}
                  </p>
                </div>
                <Money
                  minor={r.amount_minor}
                  currency={r.currency_code}
                  tone={r.type === 'income' ? 'credit' : r.type === 'expense' ? 'debit' : 'plain'}
                  size="lg"
                />
              </button>
            )
          })}
        </div>
      )}

      <PlanDialog open={creating} onClose={() => setCreating(false)} />
      <PlanDialog open={Boolean(editing)} existing={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function PlanDialog({
  open, onClose, existing,
}: { open: boolean; onClose: () => void; existing?: RecurringRule | null }) {
  const toast = useToast()
  const save = useSaveRecurring()
  const remove = useDeleteRecurring()
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()

  const [name, setName] = useState('')
  const [type, setType] = useState<TxnType>('expense')
  const [accountId, setAccountId] = useState<string | null>(null)
  const [toAccountId, setToAccountId] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [amount, setAmount] = useState<number | null>(null)
  const [freq, setFreq] = useState<RecurrenceFreq>('monthly')
  const [interval, setIntervalCount] = useState(1)
  const [startsOn, setStartsOn] = useState(today())
  const [endsOn, setEndsOn] = useState('')
  const [autoCreate, setAutoCreate] = useState(true)
  const [archived, setArchived] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setName(existing?.name ?? '')
    setType(existing?.type ?? 'expense')
    setAccountId(existing?.account_id ?? accounts?.[0]?.id ?? null)
    setToAccountId(existing?.transfer_account_id ?? null)
    setCategoryId(existing?.category_id ?? null)
    setAmount(existing?.amount_minor ?? null)
    setFreq(existing?.freq ?? 'monthly')
    setIntervalCount(existing?.interval_count ?? 1)
    setStartsOn(existing?.starts_on ?? today())
    setEndsOn(existing?.ends_on ?? '')
    setAutoCreate(existing?.auto_create ?? true)
    setArchived(existing?.archived ?? false)
    setNote(existing?.note ?? '')
  }, [open, existing, accounts])

  const from = accounts?.find((a) => a.id === accountId)

  async function submit() {
    setError(null)
    if (!name.trim()) return setError('Give the plan a name.')
    if (!accountId) return setError('Pick an account.')
    if (!amount || amount <= 0) return setError('Enter an amount above zero.')
    if (type === 'transfer' && !toAccountId) return setError('Pick the destination account.')
    try {
      await save.mutateAsync({
        id: existing?.id,
        name: name.trim(), type,
        account_id: accountId,
        transfer_account_id: type === 'transfer' ? toAccountId : null,
        category_id: type === 'transfer' ? null : categoryId,
        amount_minor: amount,
        currency_code: from?.currency_code ?? 'BDT',
        freq, interval_count: interval,
        starts_on: startsOn,
        ends_on: endsOn || null,
        // A new rule fires first on its start date.
        next_occurrence_on: existing?.next_occurrence_on ?? startsOn,
        auto_create: autoCreate,
        archived,
        note: note.trim() || null,
      })
      toast(existing ? 'Plan updated' : 'Plan created')
      onClose()
    } catch (e) { setError(humanizeError(e)) }
  }

  return (
    <>
      <Modal
        open={open} onClose={onClose}
        title={existing ? 'Edit planned payment' : 'New planned payment'}
        footer={
          <>
            {existing && <Button variant="quiet" className="mr-auto debit" onClick={() => setConfirming(true)}>Delete</Button>}
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={submit} loading={save.isPending}>
              {existing ? 'Save changes' : 'Create plan'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rent, salary, internet bill…" />
          </Field>

          <Segmented
            value={type} onChange={(v) => { setType(v); setCategoryId(null) }} className="w-full"
            options={[
              { value: 'expense', label: 'Expense', tone: 'debit' },
              { value: 'income', label: 'Income', tone: 'credit' },
              { value: 'transfer', label: 'Transfer' },
            ]}
          />

          <Field label="Amount" required>
            <AmountInput valueMinor={amount} onChange={setAmount} currency={from?.currency_code ?? 'BDT'} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={type === 'income' ? 'To account' : 'From account'} required>
              <AccountSelect value={accountId} onChange={setAccountId} accounts={accounts} />
            </Field>
            {type === 'transfer' ? (
              <Field label="To account" required>
                <AccountSelect value={toAccountId} onChange={setToAccountId} accounts={accounts}
                               exclude={accountId} placeholder="Select destination" />
              </Field>
            ) : (
              <Field label="Category">
                <CategorySelect value={categoryId} onChange={setCategoryId}
                                categories={categories} kind={type === 'income' ? 'income' : 'expense'} />
              </Field>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Repeats every">
              <Input type="number" min={1} max={366} value={interval}
                     onChange={(e) => setIntervalCount(Math.max(1, Number(e.target.value) || 1))} />
            </Field>
            <Field label="Unit">
              <Select value={freq} onChange={(e) => setFreq(e.target.value as RecurrenceFreq)}>
                {Object.entries(FREQ_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="First one on" required>
              <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </Field>
          </div>

          <Field label="Stop after" hint="Leave blank to keep going forever.">
            <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </Field>

          <Field label="Note">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>

          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" checked={autoCreate} onChange={(e) => setAutoCreate(e.target.checked)}
                   className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
            <span>
              Post it automatically
              <span className="block text-xs muted">
                Off means Uzoni only reminds you, and you confirm each one.
              </span>
            </span>
          </label>

          {existing && (
            <label className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)}
                     className="h-4 w-4 accent-[var(--accent)]" />
              Pause this plan
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
            toast('Plan deleted'); setConfirming(false); onClose()
          } catch (e) { setError(humanizeError(e)); setConfirming(false) }
        }}
        title={`Delete ${existing?.name}?`}
        body="Transactions already posted from this plan stay where they are."
      />
    </>
  )
}
