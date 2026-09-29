import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { qk } from '@/lib/queryKeys'
import { invalidateMoney } from './useAccounts'
import type {
  BudgetSuggestion, CategoryTrend, Forecast, PayeeSuggestion, ReconcileResult,
  Subscription, Transaction, UncategorizedSummary, UnusualExpense,
} from '@/lib/types'

/** The window is always this calendar month; `grace` is how far past it the chart runs. */
export function useForecast(currency: string, grace = 5, enabled = true) {
  return useQuery({
    queryKey: qk.forecast({ currency, grace }),
    enabled: enabled && Boolean(currency),
    queryFn: () => api.get<Forecast>('/advisor/forecast', { currency, grace }),
  })
}

export function useBudgetSuggestions(currency: string, enabled = true) {
  return useQuery({
    queryKey: qk.budgetSuggestions({ currency }),
    enabled: enabled && Boolean(currency),
    queryFn: () => api.get<BudgetSuggestion[]>('/advisor/budget-suggestions', { currency }),
  })
}

export function useSubscriptions(currency: string, enabled = true) {
  return useQuery({
    queryKey: qk.subscriptions({ currency }),
    enabled: enabled && Boolean(currency),
    queryFn: () => api.get<Subscription[]>('/advisor/subscriptions', { currency }),
  })
}

export function useUnusual(from: string, to: string, currency: string, enabled = true) {
  return useQuery({
    queryKey: qk.unusual({ from, to, currency }),
    enabled: enabled && Boolean(currency),
    queryFn: () => api.get<UnusualExpense[]>('/advisor/unusual', { from, to, currency }),
  })
}

export function useCategoryTrends(currency: string, months = 6, enabled = true) {
  return useQuery({
    queryKey: qk.trends({ currency, months }),
    enabled: enabled && Boolean(currency),
    queryFn: () => api.get<CategoryTrend[]>('/advisor/trends', { currency, months }),
  })
}

export function useUncategorized() {
  return useQuery({
    queryKey: qk.uncategorized,
    queryFn: () => api.get<UncategorizedSummary>('/advisor/uncategorized'),
  })
}

/** Payee memory. Empty query returns the most used, which is what an empty field wants. */
export function usePayeeSuggestions(search: string, enabled = true) {
  return useQuery({
    queryKey: qk.payeeSuggestions(search),
    enabled,
    staleTime: 60_000,
    queryFn: () => api.get<PayeeSuggestion[]>('/payees/suggest', { q: search, limit: 8 }),
  })
}

export function useLastTransaction() {
  return useQuery({
    queryKey: qk.lastTransaction,
    queryFn: () => api.get<Transaction | null>('/transactions/last'),
  })
}

export function useReconcile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ accountId, ...body }: {
      accountId: string
      actual_balance_minor: number
      occurred_on?: string
      note?: string | null
    }) => api.post<ReconcileResult>(`/accounts/${accountId}/reconcile`, body),
    onSuccess: () => invalidateMoney(qc),
  })
}