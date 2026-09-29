import { useEffect, useState } from 'react'
import { Button, Field, Input, Modal, Textarea, useToast } from '@/components/ui'
import { AmountInput } from '@/components/AmountInput'
import { Money } from '@/components/Money'
import { useReconcile } from '@/hooks/useAdvisor'
import { humanizeError } from '@/lib/api'
import { today } from '@/lib/dates'
import type { AccountWithBalance } from '@/lib/types'

/**
 * Cash drifts. A note goes missing, a small purchase never gets typed in, and
 * after a month the app and the wallet disagree — at which point most people
 * stop trusting the app rather than fixing it.
 *
 * Counting the real balance and writing the difference as an ordinary
 * transaction keeps the ledger able to explain itself: there is no hidden
 * correction, just a dated adjustment you can see and categorise later.
 */
export function ReconcileDialog({
  account, open, onClose,
}: { account: AccountWithBalance | null; open: boolean; onClose: () => void }) {
  const toast = useToast()
  const reconcile = useReconcile()
  const [actual, setActual] = useState<number | null>(null)
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const current = account?.balance?.balance_minor ?? 0
  const difference = actual == null ? null : actual - current

  useEffect(() => {
    if (!open) return
    setActual(current)
    setDate(today())
    setNote('')
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, account?.id])

  async function submit() {
    if (!account || actual == null) return
    setError(null)
    try {
      const result = await reconcile.mutateAsync({
        accountId: account.id,
        actual_balance_minor: actual,
        occurred_on: date,
        note: note.trim() || null,
      })
      toast(result.adjusted ? 'Balance adjusted' : 'Already matched — nothing to change')
      onClose()
    } catch (e) { setError(humanizeError(e)) }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Count ${account?.name ?? 'account'}`}
      description="Tell Uzoni the real balance and it writes the difference as one transaction."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={reconcile.isPending}
                  disabled={actual == null}>
            {difference === 0 ? 'Looks right' : 'Adjust'}
          </Button>
        </>
      }
    >
      {account && (
        <div className="space-y-4">
          <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-sunk)' }}>
            <p className="text-xs muted">Uzoni thinks you have</p>
            <Money minor={current} currency={account.currency_code} size="xl" tone="plain" />
          </div>

          <Field label="What is actually there" required>
            <AmountInput valueMinor={actual} onChange={setActual} currency={account.currency_code} autoFocus />
          </Field>

          {difference !== null && difference !== 0 && (
            <div className="rounded-xl px-4 py-3"
                 style={{ background: difference > 0 ? 'var(--credit-soft)' : 'var(--debit-soft)' }}>
              <p className="text-sm">
                {difference > 0 ? 'You have ' : 'You are short '}
                <Money minor={Math.abs(difference)} currency={account.currency_code}
                       tone={difference > 0 ? 'credit' : 'debit'} />
                {difference > 0 ? ' more than recorded.' : ' against what is recorded.'}
              </p>
              <p className="mt-1 text-xs muted">
                Recorded as {difference > 0 ? 'income' : 'an expense'} with no category, so you can
                file it later or leave it as a correction.
              </p>
            </div>
          )}

          {difference === 0 && (
            <p className="text-sm credit">The app and the money already agree. Nothing to adjust.</p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>

          <Field label="Note">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                      placeholder="Counted the wallet" />
          </Field>

          {error && (
            <p className="rounded-lg px-3 py-2 text-sm debit" style={{ background: 'var(--debit-soft)' }}>{error}</p>
          )}
        </div>
      )}
    </Modal>
  )
}
