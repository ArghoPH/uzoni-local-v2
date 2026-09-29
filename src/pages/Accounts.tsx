import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Archive, ArchiveRestore, Pencil, Plus, Wallet } from 'lucide-react'
import {
  Button, ConfirmDialog, EmptyState, ErrorNote, Field, Input, Modal, Select,
  SkeletonRows, Textarea, useToast,
} from '@/components/ui'
import { AmountInput } from '@/components/AmountInput'
import { ColorPicker, DEFAULT_SWATCHES } from '@/components/ColorPicker'
import { CurrencySelect } from '@/components/Pickers'
import { Money } from '@/components/Money'
import { AccountSheet, TYPE_LABELS } from '@/components/AccountSheet'
import {
  useAccounts, useCreateAccount, useDeleteAccount, useUpdateAccount,
} from '@/hooks/useAccounts'
import { useCurrencies, useProfile } from '@/hooks/useReference'
import { humanizeError } from '@/lib/api'
import { shortDate } from '@/lib/dates'
import type { AccountType, AccountWithBalance } from '@/lib/types'


export function Accounts() {
  const { data: profile } = useProfile()
  const [showArchived, setShowArchived] = useState(false)
  const q = useAccounts(showArchived)
  const [editing, setEditing] = useState<AccountWithBalance | null>(null)
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState<AccountWithBalance | null>(null)

  const grouped = useMemo(() => {
    const byCurrency = new Map<string, number>()
    for (const a of q.data ?? []) {
      if (a.archived || a.exclude_from_stats) continue
      byCurrency.set(a.currency_code, (byCurrency.get(a.currency_code) ?? 0) + (a.balance?.balance_minor ?? 0))
    }
    return [...byCurrency.entries()].sort((a, b) =>
      a[0] === profile?.base_currency ? -1 : b[0] === profile?.base_currency ? 1 : a[0].localeCompare(b[0]))
  }, [q.data, profile?.base_currency])

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold tracking-tight">Accounts</h1>
        <Button onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
          {showArchived ? 'Hide archived' : 'Show archived'}
        </Button>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus size={15} /> New account
        </Button>
      </header>

      {grouped.length > 0 && (
        <div className="panel mb-4 flex flex-wrap gap-x-10 gap-y-3 px-5 py-4">
          {grouped.map(([code, total]) => (
            <div key={code}>
              <p className="text-xs muted">Total in {code}</p>
              <Money minor={total} currency={code} size="xl" tone={total < 0 ? 'debit' : 'plain'} />
            </div>
          ))}
        </div>
      )}

      {q.isLoading ? <SkeletonRows rows={4} />
       : q.isError ? <ErrorNote error={q.error} retry={() => q.refetch()} />
       : (q.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Wallet size={28} />}
          title="No accounts yet"
          body="An account is anywhere money sits: a wallet, a bank, bKash, a credit card."
          action={<Button variant="primary" onClick={() => setCreating(true)}>Add your first account</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {q.data!.map((a) => (
            <button
              key={a.id}
              onClick={() => setOpen(a)}
              className="panel tinted p-4"
              style={{ '--tint': a.color } as CSSProperties}
            >
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
                <span
                  role="button"
                  tabIndex={0}
                  className="btn btn-quiet -mr-2 px-1.5"
                  onClick={(e) => { e.stopPropagation(); setEditing(a) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setEditing(a) } }}
                  aria-label={`Edit ${a.name}`}
                >
                  <Pencil size={14} />
                </span>
              </div>

              <div className="mt-2">
                <Money
                  minor={a.balance?.balance_minor ?? a.initial_balance_minor}
                  currency={a.currency_code}
                  size="xl"
                  tone={(a.balance?.balance_minor ?? 0) < 0 ? 'debit' : 'plain'}
                />
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs muted">
                <span>{TYPE_LABELS[a.type]}</span>
                <span aria-hidden>·</span>
                <span>{a.currency_code}</span>
                {a.balance?.last_activity_on && (
                  <>
                    <span aria-hidden>·</span>
                    <span>Last activity {shortDate(a.balance.last_activity_on)}</span>
                  </>
                )}
              </div>

              {(a.balance?.pending_minor ?? 0) !== 0 && (
                <p className="mt-1.5 text-xs" style={{ color: 'var(--warn)' }}>
                  Includes{' '}
                  <Money minor={a.balance!.pending_minor} currency={a.currency_code} size="sm" tone="plain" signed />
                  {' '}not settled yet
                </p>
              )}
              {a.archived && <p className="mt-1.5 text-xs muted">Archived</p>}
            </button>
          ))}
        </div>
      )}

      <AccountDialog open={creating} onClose={() => setCreating(false)} />
      <AccountDialog open={Boolean(editing)} existing={editing} onClose={() => setEditing(null)} />
      <AccountSheet account={open} onClose={() => setOpen(null)} />
    </div>
  )
}

/* ---------------------------------------------------------- create / edit */

function AccountDialog({
  open, onClose, existing,
}: { open: boolean; onClose: () => void; existing?: AccountWithBalance | null }) {
  const toast = useToast()
  const { data: currencies } = useCurrencies()
  const { data: profile } = useProfile()
  const create = useCreateAccount()
  const update = useUpdateAccount()
  const remove = useDeleteAccount()

  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('cash')
  const [currency, setCurrency] = useState('BDT')
  const [opening, setOpening] = useState<number | null>(0)
  const [creditLimit, setCreditLimit] = useState<number | null>(null)
  const [color, setColor] = useState(DEFAULT_SWATCHES[0])
  const [note, setNote] = useState('')
  const [excluded, setExcluded] = useState(false)
  const [archived, setArchived] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  // Reset whenever the dialog opens.
  useEffect(() => {
    if (!open) return
    setError(null)
    setName(existing?.name ?? '')
    setType(existing?.type ?? 'cash')
    setCurrency(existing?.currency_code ?? profile?.base_currency ?? 'BDT')
    setOpening(existing?.initial_balance_minor ?? 0)
    setCreditLimit(existing?.credit_limit_minor ?? null)
    setColor(existing?.color ?? DEFAULT_SWATCHES[0])
    setNote(existing?.note ?? '')
    setExcluded(existing?.exclude_from_stats ?? false)
    setArchived(existing?.archived ?? false)
  }, [open, existing, profile?.base_currency])

  const busy = create.isPending || update.isPending || remove.isPending

  async function submit() {
    setError(null)
    if (!name.trim()) return setError('Give the account a name.')
    try {
      const payload = {
        name: name.trim(), type, currency_code: currency,
        initial_balance_minor: opening ?? 0, credit_limit_minor: creditLimit,
        color, note: note.trim() || null,
        exclude_from_stats: excluded, archived,
      }
      if (existing) {
        await update.mutateAsync({ id: existing.id, ...payload })
        toast('Account updated')
      } else {
        await create.mutateAsync(payload)
        toast('Account added')
      }
      onClose()
    } catch (e) { setError(humanizeError(e)) }
  }

  async function del() {
    if (!existing) return
    try {
      await remove.mutateAsync(existing.id)
      toast('Account deleted')
      setConfirming(false); onClose()
    } catch (e) { setError(humanizeError(e)); setConfirming(false) }
  }

  return (
    <>
      <Modal
        open={open} onClose={onClose}
        title={existing ? 'Edit account' : 'New account'}
        footer={
          <>
            {existing && (
              <Button variant="quiet" className="mr-auto debit" onClick={() => setConfirming(true)} disabled={busy}>
                Delete
              </Button>
            )}
            <Button onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={submit} loading={busy}>
              {existing ? 'Save changes' : 'Add account'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="bKash, DBBL savings…" />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type">
              <Select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Currency" hint={existing ? 'Changing this does not convert existing transactions.' : undefined}>
              <CurrencySelect value={currency} onChange={setCurrency} currencies={currencies} />
            </Field>
          </div>

          <Field label="Opening balance"
                 hint="What was in the account before you started tracking it.">
            <AmountInput valueMinor={opening} onChange={setOpening} currency={currency} />
          </Field>

          {(type === 'credit_card' || type === 'overdraft') && (
            <Field label="Credit limit"
                   hint="Used to show how much of the limit is already spent.">
              <AmountInput valueMinor={creditLimit} onChange={setCreditLimit} currency={currency} />
            </Field>
          )}

          <Field label="Colour" hint="The card takes a soft shade of whatever you pick.">
            <ColorPicker value={color} onChange={setColor} />
          </Field>

          <Field label="Note">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>

          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" checked={excluded} onChange={(e) => setExcluded(e.target.checked)}
                   className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
            <span>
              Leave out of totals and reports
              <span className="block text-xs muted">Useful for an account you only watch, like someone else&apos;s.</span>
            </span>
          </label>

          {existing && (
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)}
                     className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
              <span>
                Archive this account
                <span className="block text-xs muted">It stays in your history but disappears from pickers.</span>
              </span>
            </label>
          )}

          {error && (
            <p className="rounded-lg px-3 py-2 text-sm debit" style={{ background: 'var(--debit-soft)' }}>{error}</p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirming} onClose={() => setConfirming(false)} onConfirm={del} busy={remove.isPending}
        title={`Delete ${existing?.name}?`}
        body="Every transaction in this account is deleted too, and that cannot be undone. Archive it instead if you only want it out of the way."
      />
    </>
  )
}
