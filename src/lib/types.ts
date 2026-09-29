// Mirror of the local PostgreSQL schema in db/. Single user, so no row carries
// an owner column and there is nothing to authenticate against.

export type AccountType =
  | 'general' | 'cash' | 'current' | 'credit_card' | 'savings'
  | 'investment' | 'loan' | 'mobile_wallet' | 'overdraft' | 'insurance'

export type CategoryKind = 'income' | 'expense'
export type TxnType = 'income' | 'expense' | 'transfer'
export type TxnStatus = 'cleared' | 'pending' | 'void'
export type BudgetPeriod = 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'one_time'
export type RecurrenceFreq = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'
export type DebtKind = 'lent' | 'borrowed'

export interface Currency {
  code: string
  name: string
  symbol: string
  decimal_digits: number
}

export interface Profile {
  id: number
  display_name: string | null
  base_currency: string
  locale: string
  week_starts_on: number
  month_starts_on: number
  theme: 'light' | 'dark' | 'system'
  onboarded_at: string | null
  created_at: string
  updated_at: string
}

export interface Account {
  id: string
  name: string
  type: AccountType
  currency_code: string
  initial_balance_minor: number
  credit_limit_minor: number | null
  color: string
  icon: string
  note: string | null
  exclude_from_stats: boolean
  archived: boolean
  position: number
  created_at: string
  updated_at: string
}

export interface AccountBalance {
  account_id: string
  currency_code: string
  initial_balance_minor: number
  balance_minor: number
  cleared_balance_minor: number
  pending_minor: number
  transaction_count: number
  last_activity_on: string | null
}

export type AccountWithBalance = Account & { balance: AccountBalance | null }

export interface Category {
  id: string
  parent_id: string | null
  name: string
  kind: CategoryKind
  color: string
  icon: string
  is_system: boolean
  archived: boolean
  position: number
  created_at: string
  updated_at: string
}

export type CategoryNode = Category & { children: Category[] }

export interface Label {
  id: string
  name: string
  color: string
  created_at: string
}

export interface Transaction {
  id: string
  type: TxnType
  account_id: string
  transfer_account_id: string | null
  category_id: string | null
  amount_minor: number
  currency_code: string
  transfer_amount_minor: number | null
  occurred_on: string
  payee: string | null
  note: string | null
  status: TxnStatus
  attachment_path: string | null
  recurring_rule_id: string | null
  debt_id: string | null
  goal_id: string | null
  import_hash: string | null
  created_at: string
  updated_at: string
}

export type TransactionRow = Transaction & {
  account: Pick<Account, 'id' | 'name' | 'color' | 'icon' | 'currency_code'> | null
  transfer_account: Pick<Account, 'id' | 'name' | 'color' | 'icon' | 'currency_code'> | null
  category: Pick<Category, 'id' | 'name' | 'color' | 'icon' | 'parent_id'> | null
}

export interface Budget {
  id: string
  name: string
  amount_minor: number
  currency_code: string
  period: BudgetPeriod
  starts_on: string
  ends_on: string | null
  rollover: boolean
  color: string
  archived: boolean
  created_at: string
  updated_at: string
}

export interface BudgetProgress {
  budget_id: string
  name: string
  currency_code: string
  amount_minor: number
  spent_minor: number
  rollover_minor: number
  win_start: string
  win_end: string
  missing_rate: boolean
}

export interface Goal {
  id: string
  name: string
  target_minor: number
  currency_code: string
  account_id: string | null
  target_date: string | null
  color: string
  icon: string
  note: string | null
  achieved_at: string | null
  archived: boolean
  created_at: string
  updated_at: string
}

export interface GoalContribution {
  id: string
  goal_id: string
  amount_minor: number
  occurred_on: string
  note: string | null
  transaction_id: string | null
  created_at: string
}

export interface Debt {
  id: string
  kind: DebtKind
  person_name: string
  amount_minor: number
  currency_code: string
  account_id: string | null
  occurred_on: string
  due_on: string | null
  note: string | null
  settled_at: string | null
  created_at: string
  updated_at: string
}

export interface DebtPayment {
  id: string
  debt_id: string
  amount_minor: number
  occurred_on: string
  note: string | null
  transaction_id: string | null
  created_at: string
}

export interface RecurringRule {
  id: string
  name: string
  type: TxnType
  account_id: string
  transfer_account_id: string | null
  category_id: string | null
  amount_minor: number
  currency_code: string
  payee: string | null
  note: string | null
  freq: RecurrenceFreq
  interval_count: number
  starts_on: string
  ends_on: string | null
  next_occurrence_on: string
  last_generated_on: string | null
  auto_create: boolean
  remind_days_before: number
  archived: boolean
  created_at: string
  updated_at: string
}

export interface ExchangeRate {
  id: string
  base_code: string
  quote_code: string
  rate: number
  as_of: string
  created_at: string
}

export interface CategoryTotal {
  category_id: string | null
  category_name: string
  color: string
  icon: string
  total_minor: number
  txn_count: number
}

export interface CashflowPoint {
  bucket_start: string
  income_minor: number
  expense_minor: number
  net_minor: number
}

export interface NetWorth {
  assets_minor: number
  liabilities_minor: number
  net_minor: number
  missing_rate: boolean
}

export interface PeriodTotals {
  income_minor: number
  expense_minor: number
  net_minor: number
  txn_count: number
  missing_rate: boolean
}

export interface CategoryInsight extends CategoryTotal {
  prev_total_minor: number
}

export interface PayeeTotal {
  payee: string
  total_minor: number
  txn_count: number
}

export interface BiggestExpense {
  id: string
  occurred_on: string
  payee: string | null
  amount_minor: number
  currency_code: string
  converted_minor: number | null
  category_name: string
  color: string
}

export interface Insights {
  currency: string
  range: { from: string; to: string; days: number }
  previous_range: { from: string; to: string }
  totals: PeriodTotals
  previous_totals: PeriodTotals
  categories: CategoryInsight[]
  top_payees: PayeeTotal[]
  biggest_expenses: BiggestExpense[]
  pace: {
    days_elapsed: number
    days_in_range: number
    avg_per_day_minor: number
    projected_expense_minor: number
    is_partial: boolean
  }
  missing_rate: boolean
}

/* ------------------------------------------------------------- advisor -- */

export interface ForecastPoint {
  date: string
  balance_minor: number
}

export interface UpcomingPayment {
  rule_id: string
  name: string
  occurs_on: string
  amount_minor: number
}

export interface Forecast {
  currency: string
  as_of: string
  balance_minor: number
  reserved_minor: number
  committed_minor: number
  available_minor: number
  safe_per_day_minor: number
  days_until: number
  next_income: { name: string; occurs_on: string; amount_minor: number | null } | null
  until: string
  month_end: string
  horizon_to: string
  daily_burn_minor: number
  burn_days_observed: number
  burn_confident: boolean
  upcoming: UpcomingPayment[]
  series: ForecastPoint[]
  runway_on: string | null
  runway_days: number | null
  missing_rate: boolean
}

export interface BudgetSuggestion {
  category_id: string
  category_name: string
  color: string
  months_observed: number
  average_minor: number
  highest_minor: number
  suggested_minor: number
}

export interface Subscription {
  payee: string
  cadence: RecurrenceFreq | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'biweekly'
  occurrences: number
  typical_amount_minor: number
  last_amount_minor: number
  last_seen_on: string
  next_expected_on: string
  account_id: string
  category_id: string | null
  yearly_cost_minor: number
  price_change_pct: number
  price_crept: boolean
}

export interface UnusualExpense {
  id: string
  occurred_on: string
  payee: string | null
  amount_minor: number
  currency_code: string
  converted_minor: number | null
  category_name: string
  color: string
  median_minor: number
  times_typical: number
}

export interface CategoryTrend {
  category_id: string | null
  category_name: string
  color: string
  series: { month: string; total_minor: number }[]
  total_minor: number
  change_pct: number
  direction: 'rising' | 'falling' | 'steady'
}

export interface PayeeSuggestion {
  payee: string
  category_id: string | null
  category_name: string | null
  amount_minor: number
  currency_code: string
  account_id: string
  type: TxnType
  last_used_on: string
  use_count: number
}

export interface UncategorizedSummary {
  count: number
  oldest_on: string | null
  amount_minor: number
}

export interface ReconcileResult {
  adjusted: boolean
  difference_minor: number
  balance_minor: number
  transaction: Transaction | null
}