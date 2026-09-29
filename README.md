# Uzoni

A personal finance manager that runs entirely on your own computer. Accounts,
transactions, budgets, savings goals, debts and planned payments, with
multi-currency support and reports.

No cloud, no account, no telemetry. Your data sits in a PostgreSQL database on
your machine and never leaves it.

```
browser  →  Express API (localhost)  →  PostgreSQL (localhost)
```

A browser cannot speak to PostgreSQL directly, which is why the small API in
`server/` sits in between. All three run locally, and the database is an
ordinary PostgreSQL database — open it in pgAdmin or DBeaver whenever you want
to read the raw rows.

---

## Features

| Area | What it does |
| --- | --- |
| Safe to spend | One number a day, after planned payments and savings goals are taken off the top, plus a balance forecast that shows the day the money runs out |
| Advice | Budgets suggested from your own history, subscriptions and price rises detected, unusual expenses flagged, categories that are climbing called out — each with a button, not just a number |
| Accounts | Cash, bank, mobile wallet, credit card and more, each in its own currency, with balances computed from the ledger, credit utilisation, and a reconcile flow for when cash drifts |
| Transactions | Income, expense and transfers (including cross-currency), search, filters, bulk recategorize and delete, CSV export, an inbox of anything unfiled |
| Fast entry | Paste a bKash, Nagad, bank or card SMS and the form fills itself; payees remember their category and usual amount; one tap repeats the last transaction |
| Categories | Two-level tree, seeded with a full set on first run, fully editable |
| Budgets | Weekly to yearly or one-off, scoped to chosen categories and accounts, with real carry-over when rollover is on |
| Goals | Target amount and date, contributions and withdrawals, the monthly pace needed and the pace you are actually keeping |
| Debts | Money lent and borrowed, part payments, due dates, and a settle-up line per person |
| Planned payments | Recurring rules that post themselves when due |
| Reports | Money in and out over time, net per period, breakdown by category, six-month trend per category, and a day-by-day spending heatmap |
| Import | CSV with column matching and a preview before anything is written |

Money is stored everywhere as an integer count of minor units (paisa, cents).
No amount ever touches a floating point number.

**Stack:** React 18 · TypeScript · Vite · Tailwind · TanStack Query · Recharts ·
Express · node-postgres · PostgreSQL 14+

---

## Requirements

- **Node.js 20 or newer** — [nodejs.org](https://nodejs.org)
- **PostgreSQL 14 or newer** — [postgresql.org/download](https://www.postgresql.org/download/)

During the PostgreSQL install you choose a password for the `postgres` user.
Write it down; you need it in step 3. The Windows installer also gives you
pgAdmin, which is the GUI for managing the database.

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/YOUR-USERNAME/uzoni.git
cd uzoni
npm install
```

### 2. Find out which port PostgreSQL is on

The default is 5432, but an installer will pick another port if something is
already there — so check rather than assume.

```bash
# Windows (PowerShell)
Get-Service *postgres*
Get-Content "C:\Program Files\PostgreSQL\18\data\postgresql.conf" | Select-String "port"

# macOS / Linux
psql -U postgres -c "show port;"
```

Make sure the service is running:

```bash
# Windows (PowerShell, as Administrator)
Start-Service postgresql-x64-18        # use the name Get-Service printed

# macOS
brew services start postgresql@16

# Linux
sudo systemctl start postgresql
```

### 3. Configure

```bash
cp .env.example .env        # Windows: Copy-Item .env.example .env
```

```env
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/uzoni
PORT=5174
```

- The `uzoni` database at the end does **not** have to exist yet.
- `PORT` is the port Uzoni's own API listens on. **It must be different from the
  PostgreSQL port.** If PostgreSQL is on 5174, set this to 5175.
- If your password contains `@ : / # ?`, percent-encode it: `@` → `%40`,
  `:` → `%3A`, `/` → `%2F`, `#` → `%23`, `?` → `%3F`.
- No quotes around the value, no spaces around `=`.

Check the connection before going further:

```bash
psql postgres://postgres:YOUR_PASSWORD@localhost:5432/postgres -c "select version();"
```

### 4. Create the database

```bash
npm run db:setup
```

Creates the database if it is missing and applies everything in `db/` in order:
the schema, the planning tables, the views and reporting functions, the seed
data, budget rollover, and the advice functions. It ends with
`Ready — 39 currencies, 76 categories.` Running it again is safe; it never
duplicates anything, so it is also how you pick up a new version.

### 5. Run

```bash
npm run dev
```

One command starts both the API and the web app:

```
[api] Uzoni API listening on http://127.0.0.1:5174
[web] ➜  Local: http://localhost:5173/
```

Open **http://localhost:5173**. The first screen asks for your main currency and
first account, and then you are in.

---

## Everyday use

```bash
npm run dev       # develop: API and app together, with hot reload on the frontend
npm run build     # bundle the app into dist/
npm start         # production: one process serving both the app and the API
```

After `npm run build`, `npm start` serves everything from `http://localhost:PORT`
— a single process you can leave running.

---

## Troubleshooting

**`ECONNREFUSED` when running `npm run db:setup`**
Nothing is listening on that port. PostgreSQL is not running, or it is on a
different port — go back to step 2.

**`password authentication failed`**
The password in `DATABASE_URL` is wrong, or it contains a character that needs
percent-encoding. To reset it:
`psql -U postgres -c "ALTER USER postgres WITH PASSWORD 'newpass';"`

**`Connected to PostgreSQL, but the Uzoni tables are not there`**
Run `npm run db:setup`.

**`http proxy error ... ECONNRESET` in the `[web]` output**
The API is not answering. Run it alone to see why:
`node server/index.js`, then in another terminal
`curl http://127.0.0.1:5174/api/health` (PowerShell:
`Invoke-RestMethod http://127.0.0.1:5174/api/health`). It should report
`schema: ready`.

**The app loads but every request fails**
`PORT` in `.env` probably collides with the PostgreSQL port. They must differ.

**Windows: `npm run dev` restarts in a loop**
`dev:api` deliberately does not use `node --watch`, because on Windows a project
path containing a space can send the watcher into a restart loop. If you want
auto-restart on server changes, use `npm run dev:api:watch` in its own terminal.

---

## Managing and customising the database

The database is plain PostgreSQL, so any client works. pgAdmin ships with the
Windows installer; DBeaver and Azure Data Studio (with its PostgreSQL extension)
are good cross-platform alternatives. SQL Server Management Studio cannot
connect — it only speaks the SQL Server protocol.

In pgAdmin, register a server pointing at `localhost` on **the port PostgreSQL
actually uses** (check step 2 — it is not always 5432), then find everything
under:

```
Servers → <your server> → Databases → uzoni → Schemas → public
                                                 ├── Tables (16)
                                                 ├── Views (2)
                                                 ├── Functions
                                                 └── Types (7)
```

Right-click any table → **View/Edit Data → All Rows** for a spreadsheet-style
grid. Edit a cell, press **F6** to save. For anything else, use the Query Tool
(Alt+Shift+Q).

### Before you edit anything

**Amounts are integers in minor units.** ৳1,250.50 is stored as `125050`. Type
the paisa, not the taka. The same applies to `initial_balance_minor`,
`amount_minor`, `target_minor` and every other `*_minor` column.

**Balances are not stored, so there is nothing to correct.** `account_balances`
and `account_ledger` are views computed from `transactions`. Fix the
transaction and the balance follows.

**The database still validates your edits.** Triggers reject a currency that
disagrees with the account, an expense filed under an income category, and a
cross-currency transfer with no destination amount — even from a SQL client.
That is a safety net, not an obstacle.

**Refresh the app afterwards.** The frontend caches what it has loaded; press
F5 to see hand-made changes.

**Take a backup first** for anything beyond a one-cell fix:

```bash
pg_dump postgres://postgres:YOUR_PASSWORD@localhost:5432/uzoni > backup.sql
psql   postgres://postgres:YOUR_PASSWORD@localhost:5432/uzoni < backup.sql
```

### What lives where

| Table | Holds | Safe to edit by hand? |
| --- | --- | --- |
| `settings` | One row: your name, main currency, theme, week start | Yes |
| `accounts` | Every account, with its opening balance | Yes |
| `categories` | Two-level tree; `parent_id` null means a top-level group | Yes |
| `transactions` | Income, expense and transfers | Yes, mind the minor units |
| `labels`, `transaction_labels` | Free-form tags | Yes |
| `budgets` + `budget_categories` / `budget_accounts` | Budgets and their scope; no scope rows means "everything" | Yes |
| `goals`, `goal_contributions` | Savings goals; a negative contribution is a withdrawal | Yes |
| `debts`, `debt_payments` | Money lent and borrowed, and part payments | Yes |
| `recurring_rules` | Planned payments; `next_occurrence_on` drives when one posts | Yes, but see below |
| `exchange_rates` | Rates you entered. Nothing is ever guessed | Yes |
| `currencies` | Reference list of 39 currencies and their symbols | Yes — change `symbol` to show `Tk` instead of `৳` |
| `account_balances`, `account_ledger` | **Views.** Computed, read-only | No — edit the transactions instead |

Editing `recurring_rules.next_occurrence_on` by hand moves a rule forward or
back. Setting it to a past date makes the next run post every missed occurrence
between then and today, which is usually not what you want.

### Useful queries

Transactions in readable form, with real amounts and category names:

```sql
select t.occurred_on as date,
       t.type,
       coalesce(p.name || ' > ', '') || coalesce(c.name, 'Uncategorized') as category,
       a.name as account,
       d.name as to_account,
       round(t.amount_minor / 10.0 ^ cur.decimal_digits, cur.decimal_digits) as amount,
       t.currency_code as ccy,
       t.payee, t.note, t.status, t.id
  from transactions t
  join accounts a on a.id = t.account_id
  join currencies cur on cur.code = t.currency_code
  left join accounts d on d.id = t.transfer_account_id
  left join categories c on c.id = t.category_id
  left join categories p on p.id = c.parent_id
 order by t.occurred_on desc, t.created_at desc
 limit 100;
```

Balances:

```sql
select a.name, a.currency_code,
       round(b.balance_minor / 10.0 ^ cur.decimal_digits, cur.decimal_digits) as balance,
       b.transaction_count, b.last_activity_on
  from accounts a
  join account_balances b on b.account_id = a.id
  join currencies cur on cur.code = a.currency_code
 order by a.position, a.name;
```

Common edits:

```sql
-- correct an amount (1,500.00)
update transactions set amount_minor = 150000 where id = 'PASTE-UUID';

-- recategorize
update transactions
   set category_id = (select id from categories where name = 'Restaurant')
 where id = 'PASTE-UUID';

-- show "Tk" instead of the taka sign everywhere
update currencies set symbol = 'Tk' where code = 'BDT';
```

### Adding your own account types

Account types are a PostgreSQL enum, and they are purely cosmetic — they drive a
label and a default icon, and no balance or report depends on them. Adding one
means four places, all of which must agree.

1. The database:

   ```sql
   alter type account_type add value if not exists 'dps';
   ```

   In pgAdmin you can also do this under **Types → account_type → Properties →
   Labels**. Either way, refresh the `public` node afterwards.

2. `src/lib/types.ts` — add `| 'dps'` to the `AccountType` union.
3. `src/pages/Accounts.tsx` — add `dps: 'DPS',` to `TYPE_LABELS`, which is what
   fills the dropdown.
4. `db/0001_schema.sql` — add it to the enum so a fresh clone gets it too.

`TYPE_LABELS` is typed `Record<AccountType, string>`, so `npm run typecheck`
will catch step 3 if you forget it.

Renaming is easy (`alter type account_type rename value 'general' to 'other'`),
but **PostgreSQL cannot remove an enum value**. Dropping one means recreating
the type, repointing the column and migrating any rows that used it.

The other enums — `txn_type`, `txn_status`, `category_kind`, `budget_period`,
`recurrence_freq`, `debt_kind` — are load-bearing. The ledger view, the
validation triggers and the reporting functions all branch on them, so changing
those means changing the SQL in `db/` as well. `account_type` is the only one
that is safe to extend on its own.

## Tests

```bash
npm test          # money parsing, the CSV reader, the SMS parser
npm run test:api  # every endpoint end to end against throwaway databases
npm run typecheck
```

`npm test` covers the parts most likely to lose money quietly: reading
`1,250.50` versus `1.250,50` versus `১২৫০`, rounding at the half paisa,
zero-decimal currencies like JPY and three-decimal ones like KWD, a CSV reader
that survives quoted commas and embedded newlines, and an SMS parser that has
to tell an amount apart from the fee and the resulting balance in the same
message.

`npm run test:api` runs three suites, each against its own scratch database so
one suite's rows cannot skew another's totals. Between them they assert on
balances after cross-currency transfers, rejected bad writes, budget windows and
carry-over, category rollups, idempotent generation of recurring payments,
period comparison maths, subscription and anomaly detection, and reconcile. The
databases are dropped afterwards and yours is never touched.

---

## How the data model works

**Balances are never stored.** A transfer becomes two legs in `account_ledger`:
money leaving the source and money arriving at the destination, which may be a
different amount when the currencies differ. A balance cannot fall out of step
with the transactions behind it.

**The database refuses bad data rather than trusting the app.** A trigger on
`transactions` checks that the currency matches the account, that an expense is
not filed under an income category, and that a cross-currency transfer says how
much actually arrived. Those rules hold even when you edit rows in pgAdmin.

**Exchange rates are yours, and never invented.** `fx_rate` reads the rates you
saved, most recent first, and falls back to the inverse pair. When no rate
exists the conversion returns null, and the reports say so instead of quietly
showing a wrong total.

**Repeating things are anchored, not incremented.** Budget windows and recurring
payments are computed as `start + n × interval` rather than by adding to the
previous date, so a rule that starts on the 31st gives 31 Jan → 28 Feb → 31 Mar
instead of collapsing to the 28th forever.

**Dates are calendar dates, never instants.** `toISOString()` converts to UTC
first, so east of Greenwich a locally built midnight lands on the previous day.
Every date here is formatted from local parts instead — otherwise a transaction
entered at 1am in Dhaka would be filed under yesterday.

**Detection is conservative on purpose.** A subscription has to repeat on a
steady rhythm *and* charge a near-identical amount at least half the time, so
weekly grocery runs are not mistaken for one. An unusual expense is measured
against the median of its category, not the mean, so a single spike cannot
raise the bar that finds spikes. Neither one guesses when the data is thin.

**Advice is actionable or it is not shown.** Every card on the dashboard either
creates something in one tap or links to the place where you would act. A
finding with no button is just another number to feel bad about.

---

## Security

There is no login, because there is nothing to log in to: the API binds to
`127.0.0.1` and is reachable only from the machine it runs on.

That assumption is the whole security model. **Do not expose this server to a
network or the internet** — not by changing the bind address, not through a
tunnel, not by port-forwarding. Anyone who can reach it has full access to every
row, and the schema has no per-user ownership to fall back on. Running it for
more than one person means adding authentication and row ownership first.

For the same reason, deploying this to Vercel or any other host will not work
as-is: there is no long-running server or local database there, and every
visitor would share one dataset.

---

## Project layout

```
db/           schema, views, reporting functions — applied by npm run db:setup
server/       Express API: db.js (pool), routes.js, index.js, migrate.js
src/
  lib/        api client, money maths, dates, CSV, types
  hooks/      one file per area, TanStack Query on top of the API
  components/ UI primitives, the transaction dialog, the ledger list
  pages/      one file per route
scripts/      test runners
```

---

## Notes

- Uzoni does not connect to banks. There is no public transaction API for banks,
  bKash or Nagad in Bangladesh, so transactions are entered by hand, imported
  from CSV, or pasted in from the SMS your bank already sends — which is the
  closest thing to sync that can exist here.
- `attachment_path` exists on transactions for receipt photos, but the upload UI
  is not built yet.
- `.env` is gitignored and should stay that way — it holds your database
  password.

## License

MIT
