import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  ArrowLeftRight, BarChart3, CalendarClock, Handshake, LayoutGrid,
  Moon, PiggyBank, Plus, Settings, Sun, Target, Wallet,
} from 'lucide-react'
import clsx from 'clsx'
import { useProfile, useUpdateProfile } from '@/hooks/useReference'
import { initials, useMediaQuery } from '@/components/ui'
import { TransactionDialog } from '@/components/TransactionDialog'

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/accounts', label: 'Accounts', icon: Wallet },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/debts', label: 'Debts', icon: Handshake },
  { to: '/planned', label: 'Planned', icon: CalendarClock },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
]

const MOBILE_NAV = [NAV[0], NAV[1], NAV[2], NAV[3], NAV[7]]

export function AppShell() {
  const { data: profile } = useProfile()
  const updateProfile = useUpdateProfile()
  const [adding, setAdding] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  // Theme: the profile is the source of truth, the OS fills in "system".
  useEffect(() => {
    const pref = profile?.theme ?? 'system'
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = pref === 'dark' || (pref === 'system' && mq.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [profile?.theme])

  // Press "n" anywhere to add a transaction.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && /input|textarea|select/i.test(el.tagName)) return
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault(); setAdding(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const isDark = document.documentElement.dataset.theme === 'dark'

  return (
    <div className="min-h-dvh lg:flex">
      {/* ---------------------------------------------------------- sidebar */}
      <aside
        className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col px-3 py-4 lg:flex"
        style={{ borderRight: '1px solid var(--rule)', background: 'var(--surface)' }}
      >
        <div className="flex items-center gap-2 px-2 pb-5">
          <Mark />
          <span className="text-[1.0625rem] font-semibold tracking-tight">Uzoni</span>
        </div>

        <button className="btn btn-primary mb-4 w-full" onClick={() => setAdding(true)}>
          <Plus size={16} /> Add transaction
        </button>

        <nav className="flex-1 space-y-0.5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to} to={to} end={end}
              className={({ isActive }) => clsx(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                isActive ? 'font-medium' : 'soft hover:opacity-80',
              )}
              style={({ isActive }) => isActive
                ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
                : undefined}
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-0.5 pt-3" style={{ borderTop: '1px solid var(--rule)' }}>
          <button
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm soft hover:opacity-80"
            onClick={() => updateProfile.mutate({ theme: isDark ? 'light' : 'dark' })}
          >
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
            {isDark ? 'Light theme' : 'Dark theme'}
          </button>
          <NavLink
            to="/settings"
            className={({ isActive }) => clsx(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm',
              isActive ? 'font-medium' : 'soft hover:opacity-80',
            )}
          >
            <Settings size={17} /> Settings
          </NavLink>
          <div className="flex items-center gap-2 px-2.5 pt-3">
            <div
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[0.7rem] font-semibold"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              {initials(profile?.display_name)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{profile?.display_name ?? 'You'}</p>
              <p className="truncate text-[0.7rem] muted">On this computer</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ------------------------------------------------------------ main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!isDesktop && (
          <header
            className="sticky top-0 z-30 flex items-center gap-2 px-4 py-3"
            style={{ background: 'var(--surface)', borderBottom: '1px solid var(--rule)' }}
          >
            <Mark />
            <span className="flex-1 text-base font-semibold tracking-tight">Uzoni</span>
            <button
              className="btn btn-quiet px-2"
              onClick={() => updateProfile.mutate({ theme: isDark ? 'light' : 'dark' })}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <NavLink to="/settings" className="btn btn-quiet px-2" aria-label="Settings">
              <Settings size={18} />
            </NavLink>
          </header>
        )}

        <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 pb-28 pt-4 sm:px-6 lg:pb-10 lg:pt-6">
          <Outlet />
        </main>
      </div>

      {/* ------------------------------------------------------ mobile nav */}
      {!isDesktop && (
        <>
          <button
            className="btn btn-primary fixed bottom-20 right-4 z-40 h-13 w-13 rounded-full !px-0 shadow-lg"
            style={{ height: 52, width: 52 }}
            onClick={() => setAdding(true)}
            aria-label="Add transaction"
          >
            <Plus size={22} />
          </button>
          <nav
            className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 pb-[env(safe-area-inset-bottom)]"
            style={{ background: 'var(--surface)', borderTop: '1px solid var(--rule)' }}
          >
            {MOBILE_NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to} to={to} end={end}
                className="flex flex-col items-center gap-0.5 py-2 text-[0.68rem]"
                style={({ isActive }) => ({ color: isActive ? 'var(--accent)' : 'var(--ink-muted)' })}
              >
                <Icon size={19} />
                {label}
              </NavLink>
            ))}
          </nav>
        </>
      )}

      <TransactionDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}

function Mark() {
  // Two ledger rules and a rising stroke — the app's only piece of ornament.
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="1" y="1" width="22" height="22" rx="6" fill="var(--accent)" />
      <path d="M6 9h12M6 15h12" stroke="#fff" strokeOpacity=".4" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M7 16.5 11 11l3 2.6L17.5 8" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
