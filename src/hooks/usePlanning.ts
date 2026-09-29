import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, clean } from '@/lib/api'
import { qk } from '@/lib/queryKeys'
import { invalidateMoney } from './useAccounts'
import type {
  Budget, BudgetProgress, Debt, DebtPayment, Goal, GoalContribution, RecurringRule,
} from '@/lib/types'

/* ---------------------------------------------------------------- budgets */

export function useBudgets() {
  return useQuery({ queryKey: qk.budgets, queryFn: () => api.get<Budget[]>('/budgets') })
}

export function useBudgetProgress(ref: string) {
  return useQuery({
    queryKey: qk.budgetProgress(ref),
    queryFn: () => api.get<BudgetProgress[]>('/budgets/progress', { ref }),
  })
}

export function useBudgetScope(budgetId: string | null) {
  return useQuery({
    queryKey: qk.budgetScope(budgetId ?? 'none'),
    enabled: Boolean(budgetId),
    queryFn: () =>
      api.get<{ categoryIds: string[]; accountIds: string[] }>(`/budgets/${budgetId}/scope`),
  })
}

export interface BudgetInput extends Partial<Budget> {
  name: string
  amount_minor: number
  currency_code: string
  categoryIds?: string[]
  accountIds?: string[]
}

export function useSaveBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: BudgetInput & { id?: string }) =>
      id ? api.patch<Budget>(`/budgets/${id}`, clean(body))
         : api.post<Budget>('/budgets', clean(body)),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: qk.budgets })
      qc.invalidateQueries({ queryKey: ['budget-progress'] })
      qc.invalidateQueries({ queryKey: qk.budgetScope(b.id) })
    },
  })
}

export function useDeleteBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del(`/budgets/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.budgets })
      qc.invalidateQueries({ queryKey: ['budget-progress'] })
    },
  })
}

/* ------------------------------------------------------------------ goals */

export type GoalWithProgress = Goal & {
  saved_minor: number
  first_contribution_on: string | null
}

export function useGoals() {
  return useQuery({ queryKey: qk.goals, queryFn: () => api.get<GoalWithProgress[]>('/goals') })
}

export function useSaveGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<Goal> & { id?: string; name: string }) =>
      id ? api.patch<Goal>(`/goals/${id}`, clean(body)) : api.post<Goal>('/goals', clean(body)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.goals }),
  })
}

export function useDeleteGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del(`/goals/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.goals }),
  })
}

export function useGoalContributions(goalId: string | null) {
  return useQuery({
    queryKey: qk.goalContributions(goalId ?? 'none'),
    enabled: Boolean(goalId),
    queryFn: () => api.get<GoalContribution[]>(`/goals/${goalId}/contributions`),
  })
}

export function useAddContribution() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ goal_id, ...body }: {
      goal_id: string; amount_minor: number; occurred_on: string; note?: string | null
    }) => api.post<GoalContribution>(`/goals/${goal_id}/contributions`, body),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: qk.goals })
      qc.invalidateQueries({ queryKey: qk.goalContributions(c.goal_id) })
    },
  })
}

export function useDeleteContribution() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (row: { id: string; goal_id: string }) => {
      await api.del(`/contributions/${row.id}`)
      return row
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: qk.goals })
      qc.invalidateQueries({ queryKey: qk.goalContributions(row.goal_id) })
    },
  })
}

/* ------------------------------------------------------------------ debts */

export type DebtWithProgress = Debt & { paid_minor: number; remaining_minor: number }

export function useDebts() {
  return useQuery({ queryKey: qk.debts, queryFn: () => api.get<DebtWithProgress[]>('/debts') })
}

export function useSaveDebt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<Debt> & { id?: string }) =>
      id ? api.patch<Debt>(`/debts/${id}`, clean(body)) : api.post<Debt>('/debts', clean(body)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.debts }),
  })
}

export function useDeleteDebt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del(`/debts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.debts }),
  })
}

export function useDebtPayments(debtId: string | null) {
  return useQuery({
    queryKey: qk.debtPayments(debtId ?? 'none'),
    enabled: Boolean(debtId),
    queryFn: () => api.get<DebtPayment[]>(`/debts/${debtId}/payments`),
  })
}

export function useAddDebtPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ debt_id, ...body }: {
      debt_id: string; amount_minor: number; occurred_on: string; note?: string | null
    }) => api.post<DebtPayment>(`/debts/${debt_id}/payments`, body),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: qk.debts })
      qc.invalidateQueries({ queryKey: qk.debtPayments(p.debt_id) })
    },
  })
}

/* -------------------------------------------------------------- recurring */

export function useRecurring() {
  return useQuery({ queryKey: qk.recurring, queryFn: () => api.get<RecurringRule[]>('/recurring') })
}

export function useSaveRecurring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<RecurringRule> & { id?: string }) =>
      id ? api.patch<RecurringRule>(`/recurring/${id}`, clean(body))
         : api.post<RecurringRule>('/recurring', clean(body)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.recurring }),
  })
}

export function useDeleteRecurring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del(`/recurring/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.recurring })
      invalidateMoney(qc)
    },
  })
}
