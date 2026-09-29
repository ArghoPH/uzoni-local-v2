import {
  createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState,
} from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Loader2, X } from 'lucide-react'
import clsx from 'clsx'

/* ------------------------------------------------------------------ button */

type Variant = 'primary' | 'ghost' | 'quiet' | 'danger'

export function Button({
  variant = 'ghost', loading, className, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      className={clsx('btn', `btn-${variant}`, className)}
      disabled={rest.disabled || loading}
      {...rest}
    >
      {loading && <Loader2 size={15} className="animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------- field */

export function Field({
  label, hint, error, required, children, className,
}: {
  label?: string; hint?: string; error?: string | null
  required?: boolean; children: ReactNode; className?: string
}) {
  return (
    <label className={clsx('block', className)}>
      {label && (
        <span className="mb-1.5 block text-[0.8125rem] font-medium soft">
          {label}
          {required && <span className="debit"> *</span>}
        </span>
      )}
      {children}
      {error
        ? <span className="mt-1 block text-xs debit">{error}</span>
        : hint ? <span className="mt-1 block text-xs muted">{hint}</span> : null}
    </label>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx('field', props.className)} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx('field resize-y', props.className)} />
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...props} className={clsx('field appearance-none pr-8', props.className)}>
        {children}
      </select>
      <ChevronDown
        size={15}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 muted"
        aria-hidden
      />
    </div>
  )
}

/* -------------------------------------------------------------- segmented */

export function Segmented<T extends string>({
  value, onChange, options, className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; tone?: 'credit' | 'debit' | 'neutral' }[]
  className?: string
}) {
  return (
    <div
      role="tablist"
      className={clsx('inline-flex gap-1 rounded-xl p-1', className)}
      style={{ background: 'var(--surface-sunk)' }}
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={on}
            type="button"
            onClick={() => onChange(o.value)}
            className={clsx(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              on ? 'shadow-sm' : 'muted hover:opacity-80',
            )}
            style={on ? {
              background: 'var(--surface)',
              color: o.tone === 'credit' ? 'var(--credit)'
                   : o.tone === 'debit'  ? 'var(--debit)'
                   : 'var(--ink)',
            } : undefined}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ modal */

export function Modal({
  open, onClose, title, description, children, footer, wide,
}: {
  open: boolean; onClose: () => void; title: string; description?: string
  children: ReactNode; footer?: ReactNode; wide?: boolean
}) {
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(12,14,20,.45)' }}
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={clsx(
          'relative z-10 flex max-h-[92vh] w-full flex-col rounded-t-2xl sm:rounded-2xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
        style={{ background: 'var(--surface)', boxShadow: '0 18px 50px rgba(12,14,20,.28)' }}
      >
        <div className="flex items-start gap-3 px-5 pb-3 pt-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[1.0625rem] font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-sm muted">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="btn btn-quiet -mr-2 -mt-1 px-2" aria-label="Close">
            <X size={17} />
          </button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && (
          <div
            className="flex items-center justify-end gap-2 px-5 py-3"
            style={{ borderTop: '1px solid var(--rule)' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/* ---------------------------------------------------------------- confirm */

export function ConfirmDialog({
  open, onClose, onConfirm, title, body, confirmLabel = 'Delete', destructive = true, busy,
}: {
  open: boolean; onClose: () => void; onConfirm: () => void
  title: string; body: string; confirmLabel?: string; destructive?: boolean; busy?: boolean
}) {
  return (
    <Modal
      open={open} onClose={onClose} title={title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm soft">{body}</p>
    </Modal>
  )
}

/* ------------------------------------------------------------------ toast */

interface Toast { id: number; text: string; tone: 'ok' | 'error' }
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'error') => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const seq = useRef(0)

  const push = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    const id = ++seq.current
    setItems((prev) => [...prev, { id, text, tone }])
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4200)
  }, [])

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex max-w-md items-start gap-2 rounded-xl px-3.5 py-2.5 text-sm"
            style={{
              background: 'var(--surface)',
              border: `1px solid ${t.tone === 'error' ? 'var(--debit)' : 'var(--rule-strong)'}`,
              boxShadow: '0 10px 30px rgba(12,14,20,.18)',
              color: t.tone === 'error' ? 'var(--debit)' : 'var(--ink)',
            }}
          >
            {t.tone === 'ok' && <Check size={16} className="mt-0.5 shrink-0 credit" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(ToastCtx)

/* ----------------------------------------------------------------- states */

export function EmptyState({
  icon, title, body, action,
}: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-3 muted">{icon}</div>}
      <p className="text-[0.9375rem] font-medium">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 muted">
      <Loader2 size={17} className="animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  )
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y" style={{ borderColor: 'var(--rule)' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <div className="skeleton h-8 w-8 rounded-full" />
          <div className="flex-1">
            <div className="skeleton h-3.5 w-1/3" />
            <div className="skeleton mt-1.5 h-3 w-1/4 opacity-70" />
          </div>
          <div className="skeleton h-4 w-16" />
        </div>
      ))}
    </div>
  )
}

export function ErrorNote({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = (error as { message?: string })?.message ?? String(error ?? 'Unknown error')
  return (
    <div
      className="m-4 rounded-xl px-4 py-3 text-sm"
      style={{ background: 'var(--debit-soft)', color: 'var(--debit)' }}
    >
      <p className="font-medium">That did not load.</p>
      <p className="mt-0.5 opacity-90">{msg}</p>
      {retry && <button onClick={retry} className="mt-2 underline underline-offset-2">Try again</button>}
    </div>
  )
}

/* ------------------------------------------------------------------ meter */

export function Meter({
  value, max, tone = 'accent', height = 8,
}: { value: number; max: number; tone?: 'accent' | 'credit' | 'debit' | 'warn'; height?: number }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const over = max > 0 && value > max
  const color = over ? 'var(--debit)' : `var(--${tone})`
  return (
    <div
      className="w-full overflow-hidden rounded-full"
      style={{ background: 'var(--surface-sunk)', height }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

/* ------------------------------------------------------------ misc helpers */

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms)
    return () => window.clearTimeout(t)
  }, [value, ms])
  return v
}

export function useLocalState<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch { return initial }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* private mode */ }
  }, [key, v])
  return [v, setV] as const
}

export function initials(name: string | null | undefined): string {
  if (!name) return 'U'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || 'U'
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}

export const useStableId = () => useMemo(() => Math.random().toString(36).slice(2), [])
