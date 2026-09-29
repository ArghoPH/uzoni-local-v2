import { useEffect, useMemo, useState } from 'react'
import { Button, Field, Modal, Textarea } from '@/components/ui'
import { Money } from '@/components/Money'
import { useCurrencies } from '@/hooks/useReference'
import { parseSms } from '@/lib/smsParse'
import { shortDate } from '@/lib/dates'
import type { ParsedSms } from '@/lib/smsParse'

/**
 * Paste the SMS your bank or wallet already sent you, and the form fills
 * itself. Everything read out of the message is shown before anything is
 * applied, because a parser that is confidently wrong about money is worse
 * than one that asks.
 */
export function SmsImportDialog({
  open, onClose, onApply, currency,
}: {
  open: boolean
  onClose: () => void
  onApply: (parsed: ParsedSms) => void
  currency: string
}) {
  const { data: currencies } = useCurrencies()
  const digits = currencies?.[currency]?.decimal_digits ?? 2
  const [text, setText] = useState('')

  useEffect(() => { if (open) setText('') }, [open])

  const parsed = useMemo(
    () => (text.trim() ? parseSms(text, digits) : null),
    [text, digits],
  )
  const usable = Boolean(parsed?.amountMinor)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Paste a message"
      description="From bKash, Nagad, a bank or a card alert."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!usable}
            onClick={() => { if (parsed) { onApply(parsed); onClose() } }}
          >
            Use this
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="The message">
          <Textarea
            rows={5}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Payment Tk 349.00 to Shwapno successful. Balance Tk 8,100.00. TrxID QQ11WW22 at 28/09/2026 19:40"
          />
        </Field>

        {parsed && (
          <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-sunk)' }}>
            {usable ? (
              <>
                <p className="text-xs muted">Read as</p>
                <div className="mt-1 flex flex-wrap items-baseline gap-2">
                  <Money
                    minor={parsed.amountMinor!}
                    currency={currency}
                    size="xl"
                    tone={parsed.direction === 'income' ? 'credit' : 'debit'}
                  />
                  <span className="text-sm muted">
                    {parsed.direction === 'income' ? 'money in' : 'money out'}
                  </span>
                </div>

                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[0.8125rem]">
                  {parsed.payee && <Row label="Payee" value={parsed.payee} />}
                  {parsed.occurredOn && <Row label="Date" value={shortDate(parsed.occurredOn)} />}
                  {parsed.feeMinor ? (
                    <Row label="Fee" value={<Money minor={parsed.feeMinor} currency={currency} size="sm" tone="plain" />} />
                  ) : null}
                  {parsed.balanceMinor != null && (
                    <Row label="Balance after" value={<Money minor={parsed.balanceMinor} currency={currency} size="sm" tone="plain" />} />
                  )}
                  {parsed.reference && <Row label="Reference" value={parsed.reference} />}
                </dl>

                {parsed.feeMinor ? (
                  <p className="mt-2 text-xs muted">
                    The fee is listed separately and is not added to the amount. Record it as its own
                    expense if you want it tracked.
                  </p>
                ) : null}
                {!parsed.direction && (
                  <p className="mt-2 text-xs" style={{ color: 'var(--warn)' }}>
                    The message does not say whether money came in or went out — check the type
                    before saving.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm muted">
                No amount found in that message. Paste the whole SMS, including the Tk or BDT part.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="muted">{label}</dt>
      <dd className="truncate text-right">{value}</dd>
    </>
  )
}
