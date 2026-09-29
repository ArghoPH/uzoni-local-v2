import { useEffect, useMemo, useState } from 'react'
import { MessageSquareText, RotateCcw, Trash2 } from 'lucide-react'
import { Button, Field, Input, Modal, Segmented, Textarea, useToast } from '@/components/ui'
import { AmountInput } from '@/components/AmountInput'
import { AccountSelect, CategorySelect } from '@/components/Pickers'
import { PayeeInput } from '@/components/PayeeInput'
import { SmsImportDialog } from '@/components/SmsImportDialog'
import { Money } from '@/components/Money'
import { useAccounts } from '@/hooks/useAccounts'
import { useCategories } from '@/hooks/useCategories'
import { useLastTransaction } from '@/hooks/useAdvisor'
import { useCurrencies } from '@/hooks/useReference'
import {
  useCreateTransaction, useDeleteTransaction, useUpdateTransaction,
} from '@/hooks/useTransactions'
import { humanizeError } from '@/lib/api'
import { today } from '@/lib/dates'
import type { PayeeSuggestion, TransactionRow, TxnStatus, TxnType } from '@/lib/types'
import type { ParsedSms } from '@/lib/smsParse'

export function TransactionDialog({
  open, onClose, existing, defaultAccountId,
}: {
  open: boolean
  onClose: () => void
  existing?: TransactionRow | null
  defaultAccountId?: string
}) {
  const toast = useToast()
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()
  const { data: currencies } = useCurrencies()
  const create = useCreateTransaction()
  const update = useUpdateTransaction()
  const remove = useDeleteTransaction()

  const [type, setType] = useState<TxnType>('expense')
  const [accountId, setAccountId] = useState<string | null>(null)
  const [toAccountId, setToAccountId] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [amount, setAmount] = useState<number | null>(null)
  const [toAmount, setToAmount] = useState<number | null>(null)
  const [date, setDate] = useState(today())
  const [payee, setPayee] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<TxnStatus>('cleared')
  const [error, setError] = useState<string | null>(null)
  const [smsOpen, setSmsOpen] = useState(false)

  const lastTransaction = useLastTransaction()
  const editing = Boolean(existing)

  // Load the dialog fresh every time it opens.
  useEffect(() => {
    if (!open) return
    setError(null)
    if (existing) {
      setType(existing.type)
      setAccountId(existing.account_id)
      setToAccountId(existing.transfer_account_id)
      setCategoryId(existing.category_id)
      setAmount(existing.amount_minor)
      setToAmount(existing.transfer_amount_minor)
      setDate(existing.occurred_on)
      setPayee(existing.payee ?? '')
      setNote(existing.note ?? '')
      setStatus(existing.status)
    } else {
      setType('expense')
      setAccountId(defaultAccountId ?? accounts?.[0]?.id ?? null)
      setToAccountId(null)
      setCategoryId(null)
      setAmount(null)
      setToAmount(null)
      setDate(today())
      setPayee('')
      setNote('')
      setStatus('cleared')
    }
  }, [open, existing, defaultAccountId, accounts])

  const from = useMemo(() => accounts?.find((a) => a.id === accountId), [accounts, accountId])
  const to = useMemo(() => accounts?.find((a) => a.id === toAccountId), [accounts, toAccountId])
  const crossCurrency = type === 'transfer' && Boolean(from && to) && from!.currency_code !== to!.currency_code
  const fromDigits = currencies?.[from?.currency_code ?? '']?.decimal_digits ?? 2
  const toDigits = currencies?.[to?.currency_code ?? '']?.decimal_digits ?? 2

  const busy = create.isPending || update.isPending || remove.isPending

  async function submit() {
    setError(null)
    if (!accountId) return setError('Pick an account.')
    if (!amount || amount <= 0) return setError('Enter an amount greater than zero.')
    if (type === 'transfer') {
      if (!toAccountId) return setError('Pick the account the money goes to.')
      if (toAccountId === accountId) return setError('Pick two different accounts.')
      if (crossCurrency && (!toAmount || toAmount <= 0)) {
        return setError(`Enter how much arrives in ${to?.name}.`)
      }
    }

    const payload = {
      type,
      account_id: accountId,
      transfer_account_id: type === 'transfer' ? toAccountId : null,
      category_id: type === 'transfer' ? null : categoryId,
      amount_minor: amount,
      transfer_amount_minor: type === 'transfer' && crossCurrency ? toAmount : null,
      currency_code: from?.currency_code ?? 'BDT',
      occurred_on: date,
      payee: payee.trim() || null,
      note: note.trim() || null,
      status,
    }

    try {
      if (existing) {
        await update.mutateAsync({ id: existing.id, ...payload })
        toast('Transaction updated')
      } else {
        await create.mutateAsync(payload)
        toast('Transaction added')
      }
      onClose()
    } catch (e) {
      setError(humanizeError(e))
    }
  }

  /** A past payee brings its usual category and amount along. */
  function applySuggestion(s: PayeeSuggestion) {
    if (s.type !== 'transfer') setType(s.type)
    if (s.category_id) setCategoryId(s.category_id)
    if (!amount) setAmount(s.amount_minor)
  }

  /** Fill the form from a parsed bank or wallet message. */
  function applySms(parsed: ParsedSms) {
    if (parsed.direction) { setType(parsed.direction); setCategoryId(null) }
    if (parsed.amountMinor) setAmount(parsed.amountMinor)
    if (parsed.payee) setPayee(parsed.payee)
    if (parsed.occurredOn) setDate(parsed.occurredOn)
    if (parsed.reference) {
      setNote((n) => (n.trim() ? n : `Ref ${parsed.reference}`))
    }
  }

  async function del() {
    if (!existing) return
    try {
      await remove.mutateAsync(existing.id)
      toast('Transaction deleted')
      onClose()
    } catch (e) {
      setError(humanizeError(e))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit transaction' : 'Add transaction'}
      footer={
        <>
          {editing && (
            <Button variant="quiet" className="mr-auto debit" onClick={del} disabled={busy}>
              <Trash2 size={15} /> Delete
            </Button>
          )}
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            {editing ? 'Save changes' : 'Add transaction'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!editing && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setSmsOpen(true)}>
              <MessageSquareText size={15} /> Paste a message
            </Button>
            {lastTransaction.data && (
              <Button
                onClick={() => {
                  const t = lastTransaction.data!
                  setType(t.type)
                  setAccountId(t.account_id)
                  setToAccountId(t.transfer_account_id)
                  setCategoryId(t.category_id)
                  setAmount(t.amount_minor)
                  setPayee(t.payee ?? '')
                  setNote(t.note ?? '')
                  setDate(today())
                }}
              >
                <RotateCcw size={15} /> Repeat last
              </Button>
            )}
          </div>
        )}

        <Segmented
          value={type}
          onChange={(v) => { setType(v); setCategoryId(null) }}
          className="w-full"
          options={[
            { value: 'expense', label: 'Expense', tone: 'debit' },
            { value: 'income', label: 'Income', tone: 'credit' },
            { value: 'transfer', label: 'Transfer' },
          ]}
        />

        <Field label={type === 'transfer' ? 'Amount leaving' : 'Amount'} required>
          <AmountInput
            valueMinor={amount}
            onChange={setAmount}
            currency={from?.currency_code ?? 'BDT'}
            autoFocus
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={type === 'income' ? 'To account' : 'From account'} required>
            <AccountSelect value={accountId} onChange={setAccountId} accounts={accounts} />
          </Field>

          {type === 'transfer' ? (
            <Field label="To account" required>
              <AccountSelect
                value={toAccountId} onChange={setToAccountId}
                accounts={accounts} exclude={accountId}
                placeholder="Select destination"
              />
            </Field>
          ) : (
            <Field label="Category">
              <CategorySelect
                value={categoryId} onChange={setCategoryId}
                categories={categories} kind={type === 'income' ? 'income' : 'expense'}
              />
            </Field>
          )}
        </div>

        {crossCurrency && (
          <Field
            label={`Amount arriving in ${to?.name}`}
            hint={`${from?.currency_code} and ${to?.currency_code} differ, so tell Uzoni what actually landed.`}
            required
          >
            <AmountInput
              valueMinor={toAmount}
              onChange={setToAmount}
              currency={to?.currency_code ?? 'BDT'}
            />
            {amount && toAmount && currencies ? (
              <p className="mt-1.5 text-xs muted">
                That works out at 1 {from?.currency_code} ={' '}
                <Money
                  minor={rateInMinor(amount, toAmount, fromDigits, toDigits)}
                  currency={to?.currency_code ?? 'BDT'}
                  tone="plain" size="sm"
                />
              </p>
            ) : null}
          </Field>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={type === 'income' ? 'Received from' : 'Paid to'}
                 hint="Pick a past one and its category and amount come with it.">
            <PayeeInput
              value={payee}
              onChange={setPayee}
              onPick={applySuggestion}
              placeholder={type === 'income' ? 'Employer, client…' : 'Shop, person…'}
            />
          </Field>
        </div>

        <Field label="Note">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="What was this for?" />
        </Field>

        <Field label="Status" hint="Pending still counts toward the balance, but is marked as not settled yet.">
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: 'cleared', label: 'Cleared' },
              { value: 'pending', label: 'Pending' },
              { value: 'void', label: 'Void' },
            ]}
          />
        </Field>

        {error && (
          <p className="rounded-lg px-3 py-2 text-sm debit" style={{ background: 'var(--debit-soft)' }}>
            {error}
          </p>
        )}
      </div>

      <SmsImportDialog
        open={smsOpen}
        onClose={() => setSmsOpen(false)}
        onApply={applySms}
        currency={from?.currency_code ?? 'BDT'}
      />
    </Modal>
  )
}

/**
 * How much of the destination currency one unit of the source buys, expressed
 * in the destination's minor units so <Money> can render it.
 */
function rateInMinor(fromMinor: number, toMinor: number, fromDigits: number, toDigits: number): number {
  const fromMajor = fromMinor / 10 ** fromDigits
  const toMajor = toMinor / 10 ** toDigits
  if (fromMajor === 0) return 0
  return Math.round((toMajor / fromMajor) * 10 ** toDigits)
}
