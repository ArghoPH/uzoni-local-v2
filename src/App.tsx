import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useProfile } from '@/hooks/useReference'
import { ApiError } from '@/lib/api'
import { Spinner } from '@/components/ui'
import { AppShell } from '@/components/layout/AppShell'
import { Onboarding } from '@/pages/Onboarding'
import { Dashboard } from '@/pages/Dashboard'
import { Transactions } from '@/pages/Transactions'
import { Accounts } from '@/pages/Accounts'
import { Budgets } from '@/pages/Budgets'
import { Goals } from '@/pages/Goals'
import { Debts } from '@/pages/Debts'
import { Planned } from '@/pages/Planned'
import { ServerDown } from '@/pages/ServerDown'

// Charts and the CSV import parser only load when someone opens these.
const Reports = lazy(() => import('@/pages/Reports').then((m) => ({ default: m.Reports })))
const Settings = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.Settings })))

export default function App() {
  const { data: profile, isLoading, isError, error } = useProfile()

  if (isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner label="Starting Uzoni" />
      </div>
    )
  }

  if (isError) {
    const e = error as ApiError
    return <ServerDown message={e?.message} />
  }

  if (profile && !profile.onboarded_at) {
    return (
      <Routes>
        <Route path="/welcome" element={<Onboarding />} />
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/welcome" element={<Navigate to="/" replace />} />
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/budgets" element={<Budgets />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/debts" element={<Debts />} />
        <Route path="/planned" element={<Planned />} />
        <Route path="/reports" element={<Suspense fallback={<Spinner />}><Reports /></Suspense>} />
        <Route path="/settings" element={<Suspense fallback={<Spinner />}><Settings /></Suspense>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
