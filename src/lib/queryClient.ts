import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        const code = (error as { code?: string })?.code
        // Never retry a permission or constraint problem — it will never succeed.
        if (code && /^(42|23|PGRST)/.test(code)) return false
        return failureCount < 2
      },
      refetchOnWindowFocus: true,
    },
    mutations: { retry: 0 },
  },
})
