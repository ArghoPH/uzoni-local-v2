-- ============================================================================
-- Uzoni (local) — 0002_planning.sql
-- Budgets, goals, debts, recurring rules, and the recurrence helpers.
-- ============================================================================

create or replace function recurrence_step(p_freq recurrence_freq, p_interval integer, p_n integer)
returns interval language sql immutable as $$
  select case p_freq
    when 'daily'     then make_interval(days   => p_interval * p_n)
    when 'weekly'    then make_interval(weeks  => p_interval * p_n)
    when 'biweekly'  then make_interval(weeks  => 2 * p_interval * p_n)
    when 'monthly'   then make_interval(months => p_interval * p_n)
    when 'quarterly' then make_interval(months => 3 * p_interval * p_n)
    when 'yearly'    then make_interval(years  => p_interval * p_n)
  end;
$$;

-- First occurrence strictly after p_after. Anchored on the start date, so a
-- monthly rule that begins on the 31st never collapses onto the 28th.
create or replace function recurrence_next(
  p_start date, p_freq recurrence_freq, p_interval integer, p_after date
) returns date language plpgsql immutable as $$
declare n integer := 0; candidate date;
begin
  if p_interval is null or p_interval < 1 then p_interval := 1; end if;
  loop
    candidate := (p_start + recurrence_step(p_freq, p_interval, n))::date;
    exit when candidate > p_after;
    n := n + 1;
    if n > 10000 then
      raise exception 'recurrence_next did not converge (start=%, after=%)', p_start, p_after;
    end if;
  end loop;
  return candidate;
end;
$$;

-- ---------------------------------------------------------------------------
create table if not exists budgets (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(btrim(name)) between 1 and 80),
  amount_minor  bigint not null check (amount_minor > 0),
  currency_code text not null references currencies (code),
  period        budget_period not null default 'monthly',
  starts_on     date not null default date_trunc('month', current_date)::date,
  ends_on       date,
  rollover      boolean not null default false,
  color         text not null default '#5B7CFA' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on),
  check (period <> 'one_time' or ends_on is not null)
);
drop trigger if exists set_updated_at on budgets;
create trigger set_updated_at before update on budgets
  for each row execute function tg_set_updated_at();

create table if not exists budget_categories (
  budget_id   uuid not null references budgets (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  primary key (budget_id, category_id)
);

create table if not exists budget_accounts (
  budget_id  uuid not null references budgets (id) on delete cascade,
  account_id uuid not null references accounts (id) on delete cascade,
  primary key (budget_id, account_id)
);

-- ---------------------------------------------------------------------------
create table if not exists goals (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(btrim(name)) between 1 and 80),
  target_minor  bigint not null check (target_minor > 0),
  currency_code text not null references currencies (code),
  account_id    uuid references accounts (id) on delete set null,
  target_date   date,
  color         text not null default '#22A06B' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon          text not null default 'target',
  note          text,
  achieved_at   timestamptz,
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists set_updated_at on goals;
create trigger set_updated_at before update on goals
  for each row execute function tg_set_updated_at();

create table if not exists goal_contributions (
  id             uuid primary key default gen_random_uuid(),
  goal_id        uuid not null references goals (id) on delete cascade,
  amount_minor   bigint not null check (amount_minor <> 0),
  occurred_on    date not null default current_date,
  note           text,
  transaction_id uuid references transactions (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists goal_contributions_goal_idx
  on goal_contributions (goal_id, occurred_on desc);

-- ---------------------------------------------------------------------------
create table if not exists debts (
  id            uuid primary key default gen_random_uuid(),
  kind          debt_kind not null,
  person_name   text not null check (length(btrim(person_name)) between 1 and 80),
  amount_minor  bigint not null check (amount_minor > 0),
  currency_code text not null references currencies (code),
  account_id    uuid references accounts (id) on delete set null,
  occurred_on   date not null default current_date,
  due_on        date,
  note          text,
  settled_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists set_updated_at on debts;
create trigger set_updated_at before update on debts
  for each row execute function tg_set_updated_at();

create table if not exists debt_payments (
  id             uuid primary key default gen_random_uuid(),
  debt_id        uuid not null references debts (id) on delete cascade,
  amount_minor   bigint not null check (amount_minor > 0),
  occurred_on    date not null default current_date,
  note           text,
  transaction_id uuid references transactions (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists debt_payments_debt_idx on debt_payments (debt_id, occurred_on desc);

-- ---------------------------------------------------------------------------
create table if not exists recurring_rules (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (length(btrim(name)) between 1 and 80),
  type                txn_type not null,
  account_id          uuid not null references accounts (id) on delete cascade,
  transfer_account_id uuid references accounts (id) on delete cascade,
  category_id         uuid references categories (id) on delete set null,
  amount_minor        bigint not null check (amount_minor > 0),
  currency_code       text not null references currencies (code),
  payee               text,
  note                text,
  freq                recurrence_freq not null default 'monthly',
  interval_count      integer not null default 1 check (interval_count between 1 and 366),
  starts_on           date not null default current_date,
  ends_on             date,
  next_occurrence_on  date not null,
  last_generated_on   date,
  auto_create         boolean not null default true,
  remind_days_before  smallint not null default 1 check (remind_days_before between 0 and 60),
  archived            boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on),
  constraint recurring_rules_shape check (
    case type
      when 'transfer' then transfer_account_id is not null
                       and transfer_account_id <> account_id
                       and category_id is null
      else transfer_account_id is null
    end
  )
);
create index if not exists recurring_rules_due_idx on recurring_rules (archived, next_occurrence_on);
drop trigger if exists set_updated_at on recurring_rules;
create trigger set_updated_at before update on recurring_rules
  for each row execute function tg_set_updated_at();

do $$ begin
  alter table transactions
    add constraint transactions_recurring_rule_fk
      foreign key (recurring_rule_id) references recurring_rules (id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table transactions
    add constraint transactions_debt_fk
      foreign key (debt_id) references debts (id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table transactions
    add constraint transactions_goal_fk
      foreign key (goal_id) references goals (id) on delete set null;
exception when duplicate_object then null; end $$;
