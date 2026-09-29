import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Field, Input, useToast } from '@/components/ui'
import { AmountInput } from '@/components/AmountInput'
import { CurrencySelect } from '@/components/Pickers'
import { useCurrencies, useProfile, useUpdateProfile } from '@/hooks/useReference'
import { useCreateAccount } from '@/hooks/useAccounts'
import { humanizeError } from '@/lib/api'
import type { AccountType } from '@/lib/types'

const STARTERS: { name: string; type: AccountType; icon: string; color: string }[] = [
  { name: 'Cash',    type: 'cash',          icon: 'banknote', color: '#0f7b4f' },
  { name: 'bKash',   type: 'mobile_wallet', icon: 'smartphone', color: '#be3b3b' },
  { name: 'Bank',    type: 'savings',       icon: 'landmark', color: '#3b45d6' },
]

export function Onboarding() {
  const toast = useToast()
  const qc = useQueryClient()
  const { data: currencies } = useCurrencies()
  const { data: profile } = useProfile()
  const updateProfile = useUpdateProfile()
  const createAccount = useCreateAccount()

  const [step, setStep] = useState(0)
  const [name, setName] = useState(profile?.display_name ?? '')
  const [currency, setCurrency] = useState(profile?.base_currency ?? 'BDT')
  const [accountName, setAccountName] = useState('Cash')
  const [accountType, setAccountType] = useState<AccountType>('cash')
  const [opening, setOpening] = useState<number | null>(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function finish() {
    setBusy(true); setError(null)
    try {
      try {
        await createAccount.mutateAsync({
          name: accountName.trim() || 'Cash',
          type: accountType,
          currency_code: currency,
          initial_balance_minor: opening ?? 0,
          color: STARTERS.find((s) => s.type === accountType)?.color ?? '#3b45d6',
          icon: STARTERS.find((s) => s.type === accountType)?.icon ?? 'wallet',
        })
      } catch (e) {
        // A retry after a half-finished first attempt would otherwise be stuck
        // on the account it already created. Keep it and carry on.
        if (!isDuplicateName(e)) throw e
      }

      await updateProfile.mutateAsync({
        display_name: name.trim() || null,
        base_currency: currency,
        onboarded_at: new Date().toISOString(),
      })
      await qc.invalidateQueries()
      toast('Welcome to Uzoni')
    } catch (e) {
      setError(humanizeError(e))
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-6 flex gap-1.5" aria-hidden>
        {[0, 1].map((i) => (
          <div key={i} className="h-1 flex-1 rounded-full"
               style={{ background: i <= step ? 'var(--accent)' : 'var(--rule)' }} />
        ))}
      </div>

      {step === 0 ? (
        <>
          <h1 className="text-xl font-semibold tracking-tight">First, the basics</h1>
          <p className="mt-1 text-sm muted">
            Your main currency sets how totals across accounts are added up. You can add
            other currencies later.
          </p>
          <div className="mt-6 space-y-3">
            <Field label="Your name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rafi" />
            </Field>
            <Field label="Main currency" required>
              <CurrencySelect value={currency} onChange={setCurrency} currencies={currencies} />
            </Field>
          </div>
          <Button variant="primary" className="mt-6 w-full" onClick={() => setStep(1)}>
            Continue
          </Button>
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold tracking-tight">Add your first account</h1>
          <p className="mt-1 text-sm muted">
            An account is anywhere money sits — a wallet, a bank, a mobile wallet.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <button
                key={s.name} type="button" className="chip"
                data-on={accountType === s.type}
                onClick={() => { setAccountType(s.type); setAccountName(s.name) }}
              >
                {s.name}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            <Field label="Account name" required>
              <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} />
            </Field>
            <Field label="How much is in it right now?"
                   hint="This becomes the opening balance. Leave it at zero if you would rather start from today.">
              <AmountInput valueMinor={opening} onChange={setOpening} currency={currency} />
            </Field>
          </div>

          {error && (
            <p className="mt-3 rounded-lg px-3 py-2 text-sm debit" style={{ background: 'var(--debit-soft)' }}>
              {error}
            </p>
          )}

          <div className="mt-6 flex gap-2">
            <Button onClick={() => setStep(0)} disabled={busy}>Back</Button>
            <Button variant="primary" className="flex-1" onClick={finish} loading={busy}>
              Start using Uzoni
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function isDuplicateName(error: unknown): boolean {
  const e = error as { code?: string; message?: string }
  return e?.code === '23505' || Boolean(e?.message?.includes('accounts_user_name'))
}
