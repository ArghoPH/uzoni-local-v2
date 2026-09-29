/**
 * The only thing that talks to the local API server.
 *
 * Everything runs on this machine: the browser calls /api, Vite proxies that
 * to the Express server on PORT, and the server talks to PostgreSQL. Nothing
 * leaves the computer, so there is no key to configure and nothing to sign in
 * to — but the same reason means the server must never be exposed to a network
 * without adding authentication first.
 */

export class ApiError extends Error {
  code?: string
  status: number
  detail?: string

  constructor(message: string, status: number, code?: string, detail?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.detail = detail
  }
}

const BASE = '/api'

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(BASE + path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Cannot reach the Uzoni server. Is it running?', 0, 'OFFLINE')
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try { payload = JSON.parse(text) } catch { payload = { error: { message: text } } }
  }

  if (!response.ok) {
    const err = (payload as { error?: { message?: string; code?: string; detail?: string } })?.error
    throw new ApiError(
      err?.message ?? `Request failed (${response.status})`,
      response.status, err?.code, err?.detail,
    )
  }

  return payload as T
}

/** Drops undefined and empty values so they never reach the query string. */
function qs(params: Record<string, unknown> = {}): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, Array.isArray(value) ? value.join(',') : String(value))
  }
  const s = search.toString()
  return s ? `?${s}` : ''
}

export const api = {
  get: <T>(path: string, params?: Record<string, unknown>) => request<T>('GET', path + qs(params)),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
}

/** Strip undefined so a PATCH only carries the fields that actually changed. */
export function clean<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
}

/** Turns a Postgres error into something a person can act on. */
export function humanizeError(error: unknown): string {
  if (!error) return 'Something went wrong.'
  const e = error as { message?: string; code?: string }
  const msg = e.message ?? String(error)

  if (e.code === 'OFFLINE') {
    return 'Cannot reach the Uzoni server. Check that `npm run dev` is still running.'
  }
  if (e.code === '42P01' || e.code === '42883' || e.code === '3D000') {
    return 'The database schema is missing. Stop the server and run: npm run db:setup'
  }
  if (e.code === '23505' || msg.includes('duplicate key')) {
    if (msg.includes('accounts_name')) return 'You already have an account with that name.'
    if (msg.includes('labels_name')) return 'That label already exists.'
    return 'That already exists.'
  }
  if (e.code === '23503') return 'Something it depends on no longer exists.'
  if (e.code === '23514') {
    if (msg.includes('amount_minor')) return 'The amount has to be greater than zero.'
    return 'Those values are not allowed.'
  }
  if (msg.includes('Cross-currency transfer needs')) {
    return 'Enter how much actually arrives in the destination account.'
  }
  if (msg.includes('must match account currency')) {
    return 'The amount has to be in the same currency as the account.'
  }
  if (msg.includes('Category kind')) return 'That category does not match the transaction type.'
  return msg
}
