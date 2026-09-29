import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, clean } from '@/lib/api'
import { qk } from '@/lib/queryKeys'
import type { Category, CategoryKind, CategoryNode } from '@/lib/types'

export function useCategories() {
  return useQuery({
    queryKey: qk.categories,
    staleTime: 5 * 60 * 1000,
    queryFn: () => api.get<Category[]>('/categories'),
  })
}

/** Parents with their children attached, filtered to one kind. */
export function buildTree(categories: Category[] | undefined, kind?: CategoryKind): CategoryNode[] {
  if (!categories) return []
  const list = kind ? categories.filter((c) => c.kind === kind) : categories
  const parents = list.filter((c) => !c.parent_id && !c.archived)
  return parents.map((p) => ({
    ...p,
    children: list.filter((c) => c.parent_id === p.id && !c.archived),
  }))
}

export function categoryIndex(categories: Category[] | undefined) {
  const map = new Map<string, Category>()
  for (const c of categories ?? []) map.set(c.id, c)
  return map
}

/** A category's display path: "Food & Drinks › Groceries" */
export function categoryPath(id: string | null, index: Map<string, Category>): string {
  if (!id) return 'Uncategorized'
  const c = index.get(id)
  if (!c) return 'Uncategorized'
  if (!c.parent_id) return c.name
  const p = index.get(c.parent_id)
  return p ? `${p.name} › ${c.name}` : c.name
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<Category> & { name: string; kind: CategoryKind }) =>
      api.post<Category>('/categories', clean(input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.categories }),
  })
}

export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<Category> & { id: string }) =>
      api.patch<Category>(`/categories/${id}`, clean(patch)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.categories })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del(`/categories/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.categories })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}
