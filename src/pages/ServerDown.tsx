export function ServerDown({ message }: { message?: string }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6">
      <h1 className="text-xl font-semibold">Uzoni cannot reach its server</h1>
      <p className="mt-2 text-sm soft">
        The app talks to a small API on this computer, which talks to PostgreSQL. One of the two
        is not running.
      </p>
      {message && (
        <p className="mt-3 rounded-lg px-3 py-2 text-sm debit" style={{ background: 'var(--debit-soft)' }}>
          {message}
        </p>
      )}
      <ol className="mt-5 space-y-3 text-sm soft">
        <li>
          <span className="font-medium">1. Is PostgreSQL running?</span>
          <span className="mt-0.5 block muted">
            On Windows, check the <code>postgresql</code> service. On macOS,
            <code className="mx-1">brew services start postgresql@16</code>.
          </span>
        </li>
        <li>
          <span className="font-medium">2. Does the database exist?</span>
          <pre className="mt-1 overflow-x-auto rounded-lg p-3 text-xs" style={{ background: 'var(--surface-sunk)' }}>npm run db:setup</pre>
        </li>
        <li>
          <span className="font-medium">3. Is the API running?</span>
          <span className="mt-0.5 block muted">
            <code>npm run dev</code> starts the API and this page together. Look for
            <span className="mx-1">Uzoni API listening on…</span> in the terminal.
          </span>
        </li>
        <li>
          <span className="font-medium">4. Is DATABASE_URL right?</span>
          <span className="mt-0.5 block muted">
            Check <code>.env</code> against what you set when installing PostgreSQL — the password
            is the usual culprit.
          </span>
        </li>
      </ol>
      <button className="btn btn-primary mt-6 self-start" onClick={() => window.location.reload()}>
        Try again
      </button>
    </div>
  )
}
