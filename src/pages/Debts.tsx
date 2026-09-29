import { useEffect, useMemo, useState } from 'react'
import { Handshake, Plus } from 'lucide-react'
import {
  Button, ConfirmDialog, EmptyState, ErrorNote, Field, Input, Meter, Modal,
  Segmented, SkeletonRows, Textarea, useToast,
} from '@/components/ui'
import { AmountInput } from '@/components/AmountInput'
import { AccountSelect, CurrencySelect } from '@/components/Pickers'
import { Money } from '@/components/Money'
import {
  useAddDebtPayment, useDebtPayments, useDebts, useDeleteDebt, useSaveDebt,
} from '@/hooks/usePlanning'
import type { DebtWithProgress } from '@/hooks/usePlanning'
import { useAccounts } from '@/hooks/useAccounts'
import { useCurrencies, useProfile } from '@/hooks/useReference'
import { humanizeError } from '@/lib/api'
import { dueLabel, shortDate, today } from '@/lib/dates'
import type { DebtKind } from '@/lib/types'

export function Debts() {
  const q = useDebts()
  const [tab, setTab] = useState<DebtKind>('lent')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<DebtWithProgress | null>(null)
  const [paying, setPaying] = useState<DebtWithProgress | null>(null)

  const list = useMemo(
    () => (q.data ?? []).filter((d) => d.kind === tab),
    [q.data, tab],
  )

  const totals = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of list) {
      if (d.settled_at) continue
      map.set(d.currency_code, (map.get(d.currency_code) ?? 0) + d.remaining_minor)
    }
    return [...map.entries()]
  }, [list])

  // One line per person, netting what they owe you against what you owe them,
  // because the useful question is "are we square" rather than "how many
  // separate loans exist".
  const settleUp = useMemo(() => {
    const byPerson = new Map<string, { person: string; currency: string; net: number; open: number }>()
    for (const d of q.data ?? []) {
      if (d.settled_at || d.remaining_minor <= 0) continue
      const key = `${d.person_name.trim().toLowerCase()}|${d.currency_code}`
      const entry = byPerson.get(key)
        ?? { person: d.person_name.trim(), currency: d.currency_code, net: 0, open: 0 }
      entry.net += d.kind === 'lent' ? d.remaining_minor : -d.remaining_minor
      entry.open += 1
      byPerson.set(key, entry)
    }
    return [...byPerson.values()]
      .filter((p) => p.net !== 0)
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
  }, [q.data])

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold tracking-tight">Debts</h1>
        <Button variant="primary" onClick={() => setCreating(true)}><Plus size={15} /> Record a debt</Button>
      </header>

      {settleUp.length > 0 && (
        <section className="panel mb-4 overflow-hidden">
          <p className="px-4 py-3 text-[0.9375rem] font-semibold"
             style={{ borderBottom: '1px solid var(--rule)' }}>
            Settle up
          </p>
          {settleUp.map((p) => (
            <div key={`${p.person}-${p.currency}`} className="row-rule flex items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.person}</span>
              <span className="text-xs muted">
                {p.open} open {p.open === 1 ? 'debt' : 'debts'}
              </span>
              <span className="text-sm">
                <span className="muted">{p.net > 0 ? 'owes you ' : 'you owe '}</span>
                <Money minor={Math.abs(p.net)} currency={p.currency}
                       tone={p.net > 0 ? 'credit' : 'debit'} />
              </span>
            </div>
          ))}
        </section>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          value={tab} onChange={setTab}
          options={[
            { value: 'lent' as DebtKind, label: 'They owe me', tone: 'credit' },
            { value: 'borrowed' as DebtKind, label: 'I owe them', tone: 'debit' },
          ]}
        />
        {totals.map(([code, total]) => (
          <span key={code} className="text-sm muted">
            Outstanding{' '}
            <Money minor={total} currency={code} tone={tab === 'lent' ? 'credit' : 'debit'} />
          </span>
        ))}
      </div>

      {q.isLoading ? <SkeletonRows rows={3} />
       : q.isError ? <ErrorNote error={q.error} retry={() => q.refetch()} />
       : list.length === 0 ? (
        <EmptyState
          icon={<Handshake size={28} />}
          title={tab === 'lent' ? 'Nobody owes you anything' : 'You do not owe anyone'}
          body="Record what you lent or borrowed, then log part payments as they come in."
          action={<Button variant="primary" onClick={() => setCreating(true)}>Record a debt</Button>}
        />
      ) : (
        <div className="panel overflow-hidden">
          {list.map((d) => {
            const settled = Boolean(d.settled_at) || d.remaining_minor <= 0
            return (
              <div key={d.id} className="row-rule flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <button className="block truncate text-left font-medium" onClick={() => setEditing(d)}>
                    {d.person_name}
                  </button>
                  <p className="mt-0.5 text-xs muted">
                    {shortDate(d.occurred_on)}
                    {d.due_on && !settled && <> · <span style={{ color: 'var(--warn)' }}>{dueLabel(d.due_on)}</span></>}
                    {d.note && <> · {d.note}</>}
                  </p>
                  {d.paid_minor > 0 && !settled && (
                    <div className="mt-1.5 max-w-xs">
                      <Meter value={d.paid_minor} max={d.amount_minor} tone="credit" height={5} />
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <Money
                    minor={settled ? d.amount_minor : d.remaining_minor}
                    currency={d.currency_code}
                    tone={settled ? 'muted' : d.kind === 'lent' ? 'credit' : 'debit'}
                    size="lg"
                  />
                  {d.paid_minor > 0 && !settled && (
                    <p className="text-xs muted">
                      <Money minor={d.paid_minor} currency={d.currency_code} size="sm" tone="muted" /> paid of{' '}
                      <Money minor={d.amount_minor} currency={d.currency_code} size="sm" tone="muted" />
                    </p>
                  )}
                  {settled && <p className="text-xs credit">Settled</p>}
                </div>

                {!settled && (
                  <Button onClick={() => setPaying(d)}>Log payment</Button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <DebtDialog open={creating} onClose={() => setCreating(false)} kind={tab} />
      <DebtDialog open={Boolean(editing)} existing={editing} onClose={() => setEditing(null)} kind={tab} />
      <PaymentDialog debt={paying} onClose={() => setPaying(null)} />
    </div>
  )
}

function DebtDialog({
  open, onClose, existing, kind,
}: { open: boolean; onClose: () => void; existing?: DebtWithProgress | null; kind: DebtKind }) {
  const toast = useToast()
  const save = useSaveDebt()
  const remove = useDeleteDebt()
  const { data: accounts } = useAccounts()
  const { data: currencies } = useCurrencies()
  const { data: profile } = useProfile()

  const [debtKind, setDebtKind] = useState<DebtKind>(kind)
  const [person, setPerson] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [currency, setCurrency] = useState('BDT')
  const [accountId, setAccountId] = useState<string | null>(null)
  const [occurredOn, setOccurredOn] = useState(today())
  const [dueOn, setDueOn] = useState('')
  const [note, setNote] = useState('')
  const [settled, setSettled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setDebtKind(existing?.kind ?? kind)
    setPerson(existing?.person_name ?? '')
    setAmount(existing?.amount_minor ?? null)
    setCurrency(existing?.currency_code ?? profile?.base_currency ?? 'BDT')
    setAccountId(existing?.account_id ?? null)
    setOccurredOn(existing?.occurred_on ?? today())
    setDueOn(existing?.due_on ?? '')
    setNote(existing?.note ?? '')
    setSettled(Boolean(existing?.settled_at))
  }, [open, existing, kind, profile?.base_currency])

  async function submit() {
    setError(null)
    if (!person.trim()) return setError('Whose debt is this?')
    if (!amount || amount <= 0) return setError('Enter an amount above zero.')
    try {
      await save.mutateAsync({
        id: existing?.id, kind: debtKind, person_name: person.trim(),
        amount_minor: amount, currency_code: currency, account_id: accountId,
        occurred_on: occurredOn, due_on: dueOn || null, note: note.trim() || null,
        settled_at: settled ? (existing?.settled_at ?? new Date().toISOString()) : null,
      })
      toast(existing ? 'Debt updated' : 'Debt recorded')
      onClose()
    } catch (e) { setError(humanizeError(e)) }
  }

  return (
    <>
      <Modal
        open={open} onClose={onClose}
        title={existing ? 'Edit debt' : 'Record a debt'}
        footer={
          <>
            {existing && <Button variant="quiet" className="mr-auto debit" onClick={() => setConfirming(true)}>Delete</Button>}
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={submit} loading={save.isPending}>
              {existing ? 'Save changes' : 'Record debt'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Segmented
            value={debtKind} onChange={setDebtKind} className="w-full"
            options={[
              { value: 'lent' as DebtKind, label: 'I lent money', tone: 'credit' },
              { value: 'borrowed' as DebtKind, label: 'I borrowed money', tone: 'debit' },
            ]}
          />

          <Field label={debtKind === 'lent' ? 'Who owes you' : 'Who you owe'} required>
            <Input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Name" />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount" required>
              <AmountInput valueMinor={amount} onChange={setAmount} currency={currency} />
            </Field>
            <Field label="Currency">
              <CurrencySelect value={currency} onChange={setCurrency} currencies={currencies} />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date" required>
              <Input type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />
            </Field>
            <Field label="Due date">
              <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
            </Field>
          </div>

          <Field label="Related account" hint="Optional — where the money moved.">
            <AccountSelect value={accountId} onChange={setAccountId} accounts={accounts} placeholder="No specific account" />
          </Field>

          <Field label="Note">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>

          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" checked={settled} onChange={(e) => setSettled(e.target.checked)}
                   className="h-4 w-4 accent-[var(--accent)]" />
            Fully settled
          </label>

          {error && <p className="rounded-lg px-3 py-2 text-sm debit" style={{ background: 'var(--debit-soft)' }}>{error}</p>}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirming} onClose={() => setConfirming(false)} busy={remove.isPending}
        onConfirm={async () => {
          if (!existing) return
          try {
            await remove.mutateAsync(existing.id)
            toast('Debt deleted'); setConfirming(false); onClose()
          } catch (e) { setError(humanizeError(e)); setConfirming(false) }
        }}
        title={`Delete this debt with ${existing?.person_name}?`}
        body="The debt and its payment history are removed."
      />
    </>
  )
}

function PaymentDialog({ debt, onClose }: { debt: DebtWithProgress | null; onClose: () => void }) {
  const toast = useToast()
  const add = useAddDebtPayment()
  const history = useDebtPayments(debt?.id ?? null)
  const [amount, setAmount] = useState<number | null>(null)
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!debt) return
    setAmount(debt.remaining_minor); setDate(today()); setNote(''); setError(null)
  }, [debt])

  async function submit() {
    setError(null)
    if (!debt) return
    if (!amount || amount <= 0) return setError('Enter an amount above zero.')
    try {
      await add.mutateAsync({ debt_id: debt.id, amount_minor: amount, occurred_on: date, note: note.trim() || null })
      toast('Payment recorded')
      onClose()
    } catch (e) { setError(humanizeError(e)) }
  }

  return (
    <Modal
      open={Boolean(debt)} onClose={onClose}
      title={debt ? `Payment from ${debt.person_name}` : ''}
      description={debt?.kind === 'borrowed' ? 'A payment you made toward this debt' : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={add.isPending}>Record payment</Button>
        </>
      }
    >
      {debt && (
        <div className="space-y-4">
          <p className="text-sm muted">
            Outstanding <Money minor={debt.remaining_minor} currency={debt.currency_code} tone="plain" />
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount" required>
              <AmountInput valueMinor={amount} onChange={setAmount} currency={debt.currency_code} />
            </Field>
            <Field label="Date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>

          {error && <p className="rounded-lg px-3 py-2 text-sm debit" style={{ background: 'var(--debit-soft)' }}>{error}</p>}

          {(history.data?.length ?? 0) > 0 && (
            <div>
              <p className="mb-1.5 text-[0.8125rem] font-medium soft">Already paid</p>
              <div className="overflow-hidden rounded-xl" style={{ border: '1px solid var(--rule)' }}>
                {history.data!.map((p) => (
                  <div key={p.id} className="row-rule flex items-center justify-between px-3 py-2">
                    <span className="text-sm">{shortDate(p.occurred_on)}</span>
                    <Money minor={p.amount_minor} currency={debt.currency_code} size="sm" tone="credit" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
