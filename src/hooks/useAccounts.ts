import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, clean } from '@/lib/api'
import { MONEY_KEYS, qk } from '@/lib/queryKeys'
import type { Account, AccountWithBalance } from '@/lib/types'

export function useAccounts(includeArchived = false) {
  return useQuery({
    queryKey: [...qk.accounts, includeArchived],
    queryFn: () =>
      api.get<AccountWithBalance[]>('/accounts', includeArchived ? { archived: 1 } : undefined),
  })
}

export function useCreateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<Account> & { name: string; currency_code: string }) =>
      api.post<Account>('/accounts', clean(input)),
    onSuccess: () => invalidateMoney(qc),
  })
}

export function useUpdateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<Account> & { id: string }) =>
      api.patch<Account>(`/accounts/${id}`, clean(patch)),
    onSuccess: () => invalidateMoney(qc),
  })
}

export function useDeleteAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del(`/accounts/${id}`),
    onSuccess: () => invalidateMoney(qc),
  })
}

export function invalidateMoney(qc: ReturnType<typeof useQueryClient>) {
  for (const key of MONEY_KEYS) qc.invalidateQueries({ queryKey: [key] })
}
