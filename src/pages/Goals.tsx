import { useEffect, useState } from 'react'
import { Plus, Target } from 'lucide-react'
import {
  Button, ConfirmDialog, EmptyState, ErrorNote, Field, Input, Meter, Modal,
  SkeletonRows, Textarea, useToast,
} from '@/components/ui'
import { AmountInput } from '@/components/AmountInput'
import { AccountSelect, CurrencySelect } from '@/components/Pickers'
import { Money } from '@/components/Money'
import {
  useAddContribution, useDeleteContribution, useDeleteGoal, useGoalContributions,
  useGoals, useSaveGoal,
} from '@/hooks/usePlanning'
import type { GoalWithProgress } from '@/hooks/usePlanning'
import { useAccounts } from '@/hooks/useAccounts'
import { useCurrencies, useProfile } from '@/hooks/useReference'
import { humanizeError } from '@/lib/api'
import { daysUntil, shortDate, today } from '@/lib/dates'

export function Goals() {
  const q = useGoals()
  const [editing, setEditing] = useState<GoalWithProgress | null>(null)
  const [creating, setCreating] = useState(false)
  const [contributing, setContributing] = useState<GoalWithProgress | null>(null)

  return (
    <div>
      <header className="mb-4 flex items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold tracking-tight">Goals</h1>
        <Button variant="primary" onClick={() => setCreating(true)}><Plus size={15} /> New goal</Button>
      </header>

      {q.isLoading ? <SkeletonRows rows={3} />
       : q.isError ? <ErrorNote error={q.error} retry={() => q.refetch()} />
       : (q.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Target size={28} />}
          title="Nothing being saved for yet"
          body="A goal is a number and a deadline — a laptop, Hajj, an emergency fund. Add money to it as you go."
          action={<Button variant="primary" onClick={() => setCreating(true)}>Create a goal</Button>}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {q.data!.map((g) => {
            const pct = g.target_minor > 0 ? Math.round((g.saved_minor / g.target_minor) * 100) : 0
            const remaining = Math.max(0, g.target_minor - g.saved_minor)
            const days = g.target_date ? daysUntil(g.target_date) : null
            const perMonth = days && days > 0 ? Math.ceil(remaining / Math.max(1, days / 30)) : null

            // What is actually going in each month, measured from the first
            // contribution rather than from the goal's creation date, so a goal
            // set up months before the first deposit is not judged for the gap.
            const monthsSaving = g.first_contribution_on
              ? Math.max(1, Math.abs(daysUntil(g.first_contribution_on)) / 30)
              : null
            const actualPerMonth = monthsSaving ? Math.round(g.saved_minor / monthsSaving) : null
            const pace = perMonth && actualPerMonth !== null
              ? {
                  actual: actualPerMonth,
                  gap: Math.max(0, perMonth - actualPerMonth),
                  behind: actualPerMonth < perMonth,
                }
              : null
            return (
              <div key={g.id} className="panel px-5 py-4">
                <div className="flex items-baseline gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.color }} aria-hidden />
                  <button className="flex-1 truncate text-left font-medium" onClick={() => setEditing(g)}>
                    {g.name}
                  </button>
                  <span className="fig text-sm muted">{pct}%</span>
                </div>

                <div className="mt-2.5"><Meter value={g.saved_minor} max={g.target_minor} tone="credit" /></div>

                <div className="mt-2.5 text-sm">
                  <Money minor={g.saved_minor} currency={g.currency_code} tone="plain" />
                  <span className="muted"> of </span>
                  <Money minor={g.target_minor} currency={g.currency_code} tone="muted" />
                </div>

                <p className="mt-1.5 text-xs muted">
                  {remaining === 0 ? 'Reached.'
                   : !g.target_date ? 'No target date'
                   : days! < 0 ? `Target date passed ${-days!} days ago`
                   : <>
                       {shortDate(g.target_date)}, {days} days away
                       {perMonth ? (
                         <> — needs{' '}
                           <Money minor={perMonth} currency={g.currency_code} size="sm" tone="muted" />
                           {' '}a month
                         </>
                       ) : null}
                     </>}
                </p>

                {pace && (
                  <p className="mt-1 text-xs" style={{ color: pace.behind ? 'var(--warn)' : 'var(--credit)' }}>
                    {pace.behind ? (
                      <>
                        Saving <Money minor={pace.actual} currency={g.currency_code} size="sm" tone="plain" /> a
                        month lately — <Money minor={pace.gap} currency={g.currency_code} size="sm" tone="plain" /> short
                        of the pace.
                      </>
                    ) : (
                      <>On pace at <Money minor={pace.actual} currency={g.currency_code} size="sm" tone="plain" /> a month.</>
                    )}
                  </p>
                )}

                <div className="mt-3 flex gap-2">
                  <Button variant="primary" onClick={() => setContributing(g)}>Add money</Button>
                  <Button onClick={() => setEditing(g)}>Edit</Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <GoalDialog open={creating} onClose={() => setCreating(false)} />
      <GoalDialog open={Boolean(editing)} existing={editing} onClose={() => setEditing(null)} />
      <ContributionDialog goal={contributing} onClose={() => setContributing(null)} />
    </div>
  )
}

function GoalDialog({
  open, onClose, existing,
}: { open: boolean; onClose: () => void; existing?: GoalWithProgress | null }) {
  const toast = useToast()
  const save = useSaveGoal()
  const remove = useDeleteGoal()
  const { data: accounts } = useAccounts()
  const { data: currencies } = useCurrencies()
  const { data: profile } = useProfile()

  const [name, setName] = useState('')
  const [target, setTarget] = useState<number | null>(null)
  const [currency, setCurrency] = useState('BDT')
  const [accountId, setAccountId] = useState<string | null>(null)
  const [targetDate, setTargetDate] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setName(existing?.name ?? '')
    setTarget(existing?.target_minor ?? null)
    setCurrency(existing?.currency_code ?? profile?.base_currency ?? 'BDT')
    setAccountId(existing?.account_id ?? null)
    setTargetDate(existing?.target_date ?? '')
    setNote(existing?.note ?? '')
  }, [open, existing, profile?.base_currency])

  async function submit() {
    setError(null)
    if (!name.trim()) return setError('Give the goal a name.')
    if (!target || target <= 0) return setError('Set a target above zero.')
    try {
      await save.mutateAsync({
        id: existing?.id, name: name.trim(), target_minor: target,
        currency_code: currency, account_id: accountId,
        target_date: targetDate || null, note: note.trim() || null,
      })
      toast(existing ? 'Goal updated' : 'Goal created')
      onClose()
    } catch (e) { setError(humanizeError(e)) }
  }

  return (
    <>
      <Modal
        open={open} onClose={onClose}
        title={existing ? 'Edit goal' : 'New goal'}
        footer={
          <>
            {existing && <Button variant="quiet" className="mr-auto debit" onClick={() => setConfirming(true)}>Delete</Button>}
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={submit} loading={save.isPending}>
              {existing ? 'Save changes' : 'Create goal'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Emergency fund, new laptop…" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Target amount" required>
              <AmountInput valueMinor={target} onChange={setTarget} currency={currency} />
            </Field>
            <Field label="Currency">
              <CurrencySelect value={currency} onChange={setCurrency} currencies={currencies} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Target date">
              <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </Field>
            <Field label="Kept in" hint="Optional — which account holds this money.">
              <AccountSelect value={accountId} onChange={setAccountId} accounts={accounts} placeholder="No specific account" />
            </Field>
          </div>
          <Field label="Note">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {error && <p className="rounded-lg px-3 py-2 text-sm debit" style={{ background: 'var(--debit-soft)' }}>{error}</p>}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirming} onClose={() => setConfirming(false)} busy={remove.isPending}
        onConfirm={async () => {
          if (!existing) return
          try {
            await remove.mutateAsync(existing.id)
            toast('Goal deleted'); setConfirming(false); onClose()
          } catch (e) { setError(humanizeError(e)); setConfirming(false) }
        }}
        title={`Delete ${existing?.name}?`}
        body="The goal and everything you logged against it are removed."
      />
    </>
  )
}

function ContributionDialog({ goal, onClose }: { goal: GoalWithProgress | null; onClose: () => void }) {
  const toast = useToast()
  const add = useAddContribution()
  const del = useDeleteContribution()
  const history = useGoalContributions(goal?.id ?? null)

  const [amount, setAmount] = useState<number | null>(null)
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!goal) return
    setAmount(null); setDate(today()); setNote(''); setWithdrawing(false); setError(null)
  }, [goal])

  async function submit() {
    setError(null)
    if (!goal) return
    if (!amount || amount <= 0) return setError('Enter an amount above zero.')
    try {
      await add.mutateAsync({
        goal_id: goal.id,
        amount_minor: withdrawing ? -amount : amount,
        occurred_on: date,
        note: note.trim() || null,
      })
      toast(withdrawing ? 'Withdrawal recorded' : 'Added to the goal')
      setAmount(null); setNote('')
    } catch (e) { setError(humanizeError(e)) }
  }

  return (
    <Modal
      open={Boolean(goal)} onClose={onClose}
      title={goal?.name ?? ''}
      description={goal ? 'Money you set aside for this goal' : undefined}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={submit} loading={add.isPending}>
            {withdrawing ? 'Record withdrawal' : 'Add to goal'}
          </Button>
        </>
      }
    >
      {goal && (
        <div className="space-y-4">
          <div>
            <Money minor={goal.saved_minor} currency={goal.currency_code} size="xl" tone="plain" />
            <span className="muted"> of </span>
            <Money minor={goal.target_minor} currency={goal.currency_code} tone="muted" />
            <div className="mt-2"><Meter value={goal.saved_minor} max={goal.target_minor} tone="credit" /></div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount" required>
              <AmountInput valueMinor={amount} onChange={setAmount} currency={goal.currency_code} />
            </Field>
            <Field label="Date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>

          <Field label="Note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Where did it come from?" />
          </Field>

          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" checked={withdrawing} onChange={(e) => setWithdrawing(e.target.checked)}
                   className="h-4 w-4 accent-[var(--accent)]" />
            Taking money out instead
          </label>

          {error && <p className="rounded-lg px-3 py-2 text-sm debit" style={{ background: 'var(--debit-soft)' }}>{error}</p>}

          <div>
            <p className="mb-1.5 text-[0.8125rem] font-medium soft">History</p>
            {history.isLoading ? <SkeletonRows rows={2} />
             : (history.data?.length ?? 0) === 0
               ? <p className="py-3 text-sm muted">Nothing added yet.</p>
               : (
              <div className="overflow-hidden rounded-xl" style={{ border: '1px solid var(--rule)' }}>
                {history.data!.map((c) => (
                  <div key={c.id} className="row-rule flex items-center gap-3 px-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm">{shortDate(c.occurred_on)}</span>
                      {c.note && <span className="block truncate text-xs muted">{c.note}</span>}
                    </span>
                    <Money minor={c.amount_minor} currency={goal.currency_code} signed size="sm" />
                    <button
                      className="btn btn-quiet px-1.5 text-xs"
                      onClick={() => del.mutate({ id: c.id, goal_id: goal.id })}
                      aria-label="Remove entry"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
