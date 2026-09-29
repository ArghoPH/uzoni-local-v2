import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { qk } from '@/lib/queryKeys'
import type { CashflowPoint, CategoryKind, CategoryTotal, Insights, NetWorth } from '@/lib/types'

export function useCategoryTotals(
  from: string, to: string, currency: string, kind: CategoryKind = 'expense', enabled = true,
) {
  return useQuery({
    queryKey: qk.categoryTotals({ from, to, currency, kind }),
    enabled: enabled && Boolean(currency),
    queryFn: () => api.get<CategoryTotal[]>('/reports/category-totals', { from, to, currency, kind }),
  })
}

export function useCashflow(
  from: string, to: string, currency: string,
  bucket: 'day' | 'week' | 'month' | 'year', enabled = true,
) {
  return useQuery({
    queryKey: qk.cashflow({ from, to, currency, bucket }),
    enabled: enabled && Boolean(currency),
    queryFn: () => api.get<CashflowPoint[]>('/reports/cashflow', { from, to, currency, bucket }),
  })
}

export function useNetWorth(currency: string, asOf: string, enabled = true) {
  return useQuery({
    queryKey: qk.netWorth({ currency, asOf }),
    enabled: enabled && Boolean(currency),
    queryFn: () => api.get<NetWorth>('/reports/net-worth', { currency, asOf }),
  })
}

/**
 * Everything the spending cards need in one request: this period, the period
 * before it, the category split, where the money went and how fast it is going.
 */
export function useInsights(from: string, to: string, currency: string, enabled = true) {
  return useQuery({
    queryKey: qk.insights({ from, to, currency }),
    enabled: enabled && Boolean(currency),
    queryFn: () => api.get<Insights>('/reports/insights', { from, to, currency, limit: 5 }),
  })
}
