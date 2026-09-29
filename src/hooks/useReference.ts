import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { qk } from '@/lib/queryKeys'
import type { Currency, ExchangeRate, Profile } from '@/lib/types'

export function useCurrencies() {
  return useQuery({
    queryKey: qk.currencies,
    staleTime: Infinity,
    queryFn: async (): Promise<Record<string, Currency>> => {
      const list = await api.get<Currency[]>('/currencies')
      return Object.fromEntries(list.map((c) => [c.code, c]))
    },
  })
}

/** The single settings row. Named "profile" because that is what the UI calls it. */
export function useProfile() {
  return useQuery({
    queryKey: qk.profile,
    queryFn: () => api.get<Profile>('/settings'),
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<Profile>) => api.patch<Profile>('/settings', patch),
    onSuccess: (p) => {
      qc.setQueryData(qk.profile, p)
      qc.invalidateQueries({ queryKey: ['net-worth'] })
    },
  })
}

export function useRates() {
  return useQuery({
    queryKey: qk.rates,
    queryFn: () => api.get<ExchangeRate[]>('/rates'),
  })
}

export function useSaveRate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (row: { base_code: string; quote_code: string; rate: number; as_of: string }) =>
      api.post<ExchangeRate>('/rates', row),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.rates })
      for (const key of ['net-worth', 'budget-progress', 'category-totals', 'cashflow']) {
        qc.invalidateQueries({ queryKey: [key] })
      }
    },
  })
}

export function useDeleteRate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del(`/rates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.rates }),
  })
}
