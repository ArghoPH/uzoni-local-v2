-- ============================================================================
-- Uzoni (local) — 0001_schema.sql
-- Single-user schema for a PostgreSQL database running on your own machine.
-- No auth, no row-level security: the database is reachable only from this
-- computer, and the API server in server/ is the only thing that talks to it.
-- Money is always an integer count of minor units (paisa, cents). Never float.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type account_type as enum (
    'general','cash','current','credit_card','savings',
    'investment','loan','mobile_wallet','overdraft','insurance');
exception when duplicate_object then null; end $$;

do $$ begin
  create type category_kind as enum ('income','expense');
exception when duplicate_object then null; end $$;

do $$ begin
  create type txn_type as enum ('income','expense','transfer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type txn_status as enum ('cleared','pending','void');
exception when duplicate_object then null; end $$;

do $$ begin
  create type budget_period as enum ('weekly','monthly','quarterly','yearly','one_time');
exception when duplicate_object then null; end $$;

do $$ begin
  create type recurrence_freq as enum ('daily','weekly','biweekly','monthly','quarterly','yearly');
exception when duplicate_object then null; end $$;

do $$ begin
  create type debt_kind as enum ('lent','borrowed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- currencies
-- ---------------------------------------------------------------------------
create table if not exists currencies (
  code            text primary key check (code ~ '^[A-Z]{3}$'),
  name            text not null,
  symbol          text not null,
  decimal_digits  smallint not null default 2 check (decimal_digits between 0 and 4)
);

-- ---------------------------------------------------------------------------
-- settings — exactly one row, id is pinned to 1
-- ---------------------------------------------------------------------------
create table if not exists settings (
  id              smallint primary key default 1 check (id = 1),
  display_name    text,
  base_currency   text not null default 'BDT' references currencies (code),
  locale          text not null default 'en',
  week_starts_on  smallint not null default 6 check (week_starts_on between 0 and 6),
  month_starts_on smallint not null default 1 check (month_starts_on between 1 and 28),
  theme           text not null default 'system' check (theme in ('light','dark','system')),
  onboarded_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists set_updated_at on settings;
create trigger set_updated_at before update on settings
  for each row execute function tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- exchange_rates
-- ---------------------------------------------------------------------------
create table if not exists exchange_rates (
  id          uuid primary key default gen_random_uuid(),
  base_code   text not null references currencies (code),
  quote_code  text not null references currencies (code),
  rate        numeric(20,10) not null check (rate > 0),
  as_of       date not null default current_date,
  created_at  timestamptz not null default now(),
  unique (base_code, quote_code, as_of),
  check (base_code <> quote_code)
);
create index if not exists exchange_rates_lookup_idx
  on exchange_rates (base_code, quote_code, as_of desc);

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------
create table if not exists accounts (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null check (length(btrim(name)) between 1 and 60),
  type                  account_type not null default 'general',
  currency_code         text not null references currencies (code),
  initial_balance_minor bigint not null default 0,
  credit_limit_minor    bigint check (credit_limit_minor is null or credit_limit_minor >= 0),
  color                 text not null default '#5B7CFA' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon                  text not null default 'wallet',
  note                  text,
  exclude_from_stats    boolean not null default false,
  archived              boolean not null default false,
  position              integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index if not exists accounts_name_uidx on accounts (lower(btrim(name)));
create index if not exists accounts_order_idx on accounts (archived, position);

drop trigger if exists set_updated_at on accounts;
create trigger set_updated_at before update on accounts
  for each row execute function tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- categories (two levels)
-- ---------------------------------------------------------------------------
create table if not exists categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references categories (id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 60),
  kind        category_kind not null,
  color       text not null default '#8E8E93' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon        text not null default 'tag',
  is_system   boolean not null default false,
  archived    boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists categories_kind_idx on categories (kind, position);
create index if not exists categories_parent_idx on categories (parent_id);

drop trigger if exists set_updated_at on categories;
create trigger set_updated_at before update on categories
  for each row execute function tg_set_updated_at();

create or replace function tg_categories_check_parent()
returns trigger language plpgsql as $$
declare p record;
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id = new.id then
    raise exception 'A category cannot be its own parent';
  end if;
  select id, kind, parent_id into p from categories where id = new.parent_id;
  if p is null then
    raise exception 'Parent category does not exist';
  end if;
  if p.kind <> new.kind then
    raise exception 'Parent category kind (%) does not match child kind (%)', p.kind, new.kind;
  end if;
  if p.parent_id is not null then
    raise exception 'Categories can only be nested two levels deep';
  end if;
  return new;
end;
$$;

drop trigger if exists categories_check_parent on categories;
create trigger categories_check_parent
  before insert or update of parent_id, kind on categories
  for each row execute function tg_categories_check_parent();

-- ---------------------------------------------------------------------------
-- labels
-- ---------------------------------------------------------------------------
create table if not exists labels (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 40),
  color       text not null default '#A0A0A8' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at  timestamptz not null default now()
);
create unique index if not exists labels_name_uidx on labels (lower(btrim(name)));

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------
create table if not exists transactions (
  id                    uuid primary key default gen_random_uuid(),
  type                  txn_type not null,
  account_id            uuid not null references accounts (id) on delete cascade,
  transfer_account_id   uuid references accounts (id) on delete cascade,
  category_id           uuid references categories (id) on delete set null,
  amount_minor          bigint not null check (amount_minor > 0),
  currency_code         text not null references currencies (code),
  transfer_amount_minor bigint check (transfer_amount_minor is null or transfer_amount_minor > 0),
  occurred_on           date not null default current_date,
  payee                 text check (payee is null or length(payee) <= 120),
  note                  text check (note is null or length(note) <= 2000),
  status                txn_status not null default 'cleared',
  attachment_path       text,
  recurring_rule_id     uuid,
  debt_id               uuid,
  goal_id               uuid,
  import_hash           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint transactions_shape check (
    case type
      when 'transfer' then
        transfer_account_id is not null
        and transfer_account_id <> account_id
        and category_id is null
      else
        transfer_account_id is null
        and transfer_amount_minor is null
    end
  )
);
create index if not exists transactions_date_idx on transactions (occurred_on desc, created_at desc);
create index if not exists transactions_account_idx on transactions (account_id, occurred_on desc);
create index if not exists transactions_transfer_idx on transactions (transfer_account_id, occurred_on desc)
  where transfer_account_id is not null;
create index if not exists transactions_category_idx on transactions (category_id, occurred_on desc);
create index if not exists transactions_search_idx on transactions
  using gin ((coalesce(payee,'') || ' ' || coalesce(note,'')) gin_trgm_ops);
create unique index if not exists transactions_import_hash_uidx
  on transactions (import_hash) where import_hash is not null;

drop trigger if exists set_updated_at on transactions;
create trigger set_updated_at before update on transactions
  for each row execute function tg_set_updated_at();

create or replace function tg_transactions_validate()
returns trigger language plpgsql as $$
declare src record; dst record; cat record;
begin
  select id, currency_code into src from accounts where id = new.account_id;
  if src is null then raise exception 'Account does not exist'; end if;

  if new.currency_code is null then
    new.currency_code := src.currency_code;
  elsif new.currency_code <> src.currency_code then
    raise exception 'Transaction currency (%) must match account currency (%)',
      new.currency_code, src.currency_code;
  end if;

  if new.type = 'transfer' then
    select id, currency_code into dst from accounts where id = new.transfer_account_id;
    if dst is null then raise exception 'Destination account does not exist'; end if;
    if src.currency_code = dst.currency_code then
      new.transfer_amount_minor := new.amount_minor;
    elsif new.transfer_amount_minor is null then
      raise exception 'Cross-currency transfer needs transfer_amount_minor (% -> %)',
        src.currency_code, dst.currency_code;
    end if;
  end if;

  if new.category_id is not null then
    select id, kind into cat from categories where id = new.category_id;
    if cat is null then raise exception 'Category does not exist'; end if;
    if (new.type = 'income' and cat.kind <> 'income')
    or (new.type = 'expense' and cat.kind <> 'expense') then
      raise exception 'Category kind (%) does not match transaction type (%)', cat.kind, new.type;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_validate on transactions;
create trigger transactions_validate before insert or update on transactions
  for each row execute function tg_transactions_validate();

create table if not exists transaction_labels (
  transaction_id uuid not null references transactions (id) on delete cascade,
  label_id       uuid not null references labels (id) on delete cascade,
  primary key (transaction_id, label_id)
);
