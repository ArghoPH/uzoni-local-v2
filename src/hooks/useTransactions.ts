import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, clean } from '@/lib/api'
import { qk } from '@/lib/queryKeys'
import { invalidateMoney } from './useAccounts'
import type { Transaction, TransactionRow, TxnStatus, TxnType } from '@/lib/types'

export interface TxnFilters {
  from?: string
  to?: string
  accountIds?: string[]
  categoryIds?: string[]
  types?: TxnType[]
  status?: TxnStatus[]
  search?: string
  minMinor?: number
  maxMinor?: number
  /** Only rows with no category — the inbox of things still to file. */
  uncategorized?: boolean
}

const PAGE = 50

export function useTransactions(filters: TxnFilters) {
  return useInfiniteQuery({
    queryKey: qk.transactions(filters),
    initialPageParam: 0,
    getNextPageParam: (last: TransactionRow[], all) =>
      last.length < PAGE ? undefined : all.length * PAGE,
    queryFn: ({ pageParam }) =>
      api.get<TransactionRow[]>('/transactions', {
        from: filters.from,
        to: filters.to,
        types: filters.types,
        status: filters.status,
        accountIds: filters.accountIds,
        categoryIds: filters.categoryIds,
        search: filters.search?.trim(),
        minMinor: filters.minMinor,
        maxMinor: filters.maxMinor,
        uncategorized: filters.uncategorized ? 1 : undefined,
        limit: PAGE,
        offset: pageParam,
      }),
  })
}

export interface TxnInput {
  type: TxnType
  account_id: string
  transfer_account_id?: string | null
  category_id?: string | null
  amount_minor: number
  transfer_amount_minor?: number | null
  currency_code: string
  occurred_on: string
  payee?: string | null
  note?: string | null
  status?: TxnStatus
  attachment_path?: string | null
}

export function useCreateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TxnInput) => api.post<Transaction>('/transactions', clean(input)),
    onSuccess: () => invalidateMoney(qc),
  })
}

export function useUpdateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<TxnInput> & { id: string }) =>
      api.patch<Transaction>(`/transactions/${id}`, clean(patch)),
    onSuccess: () => invalidateMoney(qc),
  })
}

export function useDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del(`/transactions/${id}`),
    onSuccess: () => invalidateMoney(qc),
  })
}

export function useDeleteTransactions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => api.post('/transactions/bulk-delete', { ids }),
    onSuccess: () => invalidateMoney(qc),
  })
}

export function useBulkCategorize() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { ids: string[]; category_id: string | null }) =>
      api.post('/transactions/bulk-category', input),
    onSuccess: () => invalidateMoney(qc),
  })
}

/** Post every planned payment that has come due. */
export function useGenerateRecurring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (through?: string) => {
      const { created } = await api.post<{ created: number }>('/recurring/generate', { through })
      return created
    },
    onSuccess: () => {
      invalidateMoney(qc)
      qc.invalidateQueries({ queryKey: qk.recurring })
    },
  })
}
