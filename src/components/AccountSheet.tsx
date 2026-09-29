import { useState } from 'react'
import { Plus, Scale } from 'lucide-react'
import { Button, EmptyState, Meter, Modal, SkeletonRows } from '@/components/ui'
import { Money } from '@/components/Money'
import { TransactionList } from '@/components/TransactionList'
import { TransactionDialog } from '@/components/TransactionDialog'
import { ReconcileDialog } from '@/components/ReconcileDialog'
import { useTransactions } from '@/hooks/useTransactions'
import type { AccountType, AccountWithBalance, TransactionRow } from '@/lib/types'

export const TYPE_LABELS: Record<AccountType, string> = {
  general: 'General', cash: 'Cash', current: 'Current account', credit_card: 'Credit card',
  savings: 'Savings', investment: 'Investment', loan: 'Loan',
  mobile_wallet: 'Mobile wallet', overdraft: 'Overdraft', insurance: 'Insurance',
}

/**
 * One account's balance and full history, in a dialog. Opened from the
 * Accounts page and from the account strip on the dashboard, so it lives here
 * rather than inside either page.
 */
export function AccountSheet({ account, onClose }: { account: AccountWithBalance | null; onClose: () => void }) {
  const [editing, setEditing] = useState<TransactionRow | null>(null)
  const [adding, setAdding] = useState(false)
  const [reconciling, setReconciling] = useState(false)

  const q = useTransactions({
    accountIds: account ? [account.id] : undefined,
    from: '1970-01-01',
  })
  const rows = q.data?.pages.flat() ?? []

  return (
    <>
      <Modal
        open={Boolean(account)} onClose={onClose} wide
        title={account?.name ?? ''}
        description={account ? `${TYPE_LABELS[account.type]} · ${account.currency_code}` : undefined}
        footer={
          <>
            <Button className="mr-auto" onClick={() => setReconciling(true)}>
              <Scale size={15} /> Count it
            </Button>
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus size={15} /> Add transaction
            </Button>
          </>
        }
      >
        {account && (
          <>
            <div className="mb-4 flex flex-wrap gap-x-8 gap-y-2">
              <div>
                <p className="text-xs muted">Balance</p>
                <Money minor={account.balance?.balance_minor ?? 0} currency={account.currency_code} size="xl" tone="plain" />
              </div>
              <div>
                <p className="text-xs muted">Opening</p>
                <Money minor={account.initial_balance_minor} currency={account.currency_code} size="lg" tone="muted" />
              </div>
              <div>
                <p className="text-xs muted">Transactions</p>
                <p className="fig text-lg font-semibold">{account.balance?.transaction_count ?? 0}</p>
              </div>
            </div>

            {account.credit_limit_minor ? (
              <div className="mb-4">
                <div className="mb-1 flex items-baseline justify-between text-xs muted">
                  <span>Credit used</span>
                  <span>
                    <Money minor={Math.max(0, -(account.balance?.balance_minor ?? 0))}
                           currency={account.currency_code} size="sm" tone="plain" />
                    {' of '}
                    <Money minor={account.credit_limit_minor} currency={account.currency_code}
                           size="sm" tone="muted" />
                  </span>
                </div>
                <Meter
                  value={Math.max(0, -(account.balance?.balance_minor ?? 0))}
                  max={account.credit_limit_minor}
                  tone="warn"
                />
              </div>
            ) : null}

            <div className="overflow-hidden rounded-xl" style={{ border: '1px solid var(--rule)' }}>
              {q.isLoading ? <SkeletonRows rows={5} />
               : rows.length === 0 ? <EmptyState title="Nothing here yet" body="Transactions in this account will appear here." />
               : <TransactionList rows={rows} forAccountId={account.id} onPick={setEditing} showRunningDayTotal={false} />}
            </div>

            {q.hasNextPage && (
              <div className="pt-3 text-center">
                <Button onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>Load more</Button>
              </div>
            )}
          </>
        )}
      </Modal>

      <TransactionDialog open={Boolean(editing)} existing={editing} onClose={() => setEditing(null)} />
      <TransactionDialog open={adding} defaultAccountId={account?.id} onClose={() => setAdding(false)} />
      <ReconcileDialog account={account} open={reconciling} onClose={() => setReconciling(false)} />
    </>
  )
}