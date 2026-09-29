-- ============================================================================
-- Uzoni (local) — 0003_views_functions.sql
-- Balance views, FX conversion and the reporting functions the API calls.
-- ============================================================================

-- Every transaction expanded into signed legs. A transfer makes two: money
-- leaving the source and money arriving at the destination, which can be a
-- different amount when the currencies differ.
create or replace view account_ledger as
  select t.id as transaction_id, t.account_id, t.occurred_on, t.status,
         case when t.type = 'income' then t.amount_minor else -t.amount_minor end as delta_minor
    from transactions t
   where t.type in ('income','expense')
  union all
  select t.id, t.account_id, t.occurred_on, t.status, -t.amount_minor
    from transactions t where t.type = 'transfer'
  union all
  select t.id, t.transfer_account_id, t.occurred_on, t.status,
         coalesce(t.transfer_amount_minor, t.amount_minor)
    from transactions t where t.type = 'transfer';

create or replace view account_balances as
  select a.id as account_id,
         a.currency_code,
         a.initial_balance_minor,
         (a.initial_balance_minor
           + coalesce(sum(l.delta_minor) filter (where l.status <> 'void'), 0))::bigint as balance_minor,
         (a.initial_balance_minor
           + coalesce(sum(l.delta_minor) filter (where l.status = 'cleared'), 0))::bigint as cleared_balance_minor,
         coalesce(sum(l.delta_minor) filter (where l.status = 'pending'), 0)::bigint as pending_minor,
         count(l.transaction_id) as transaction_count,
         max(l.occurred_on) as last_activity_on
    from accounts a
    left join account_ledger l on l.account_id = a.id
   group by a.id;

-- ---------------------------------------------------------------------------
-- FX: the rates you saved, most recent first, falling back to the inverse
-- pair. Returns null when nothing is known — the reports say so rather than
-- inventing a number.
-- ---------------------------------------------------------------------------
create or replace function fx_rate(p_from text, p_to text, p_as_of date default current_date)
returns numeric language sql stable as $$
  select case
    when p_from = p_to then 1::numeric
    else coalesce(
      (select r.rate from exchange_rates r
        where r.base_code = p_from and r.quote_code = p_to and r.as_of <= p_as_of
        order by r.as_of desc limit 1),
      (select 1 / r.rate from exchange_rates r
        where r.base_code = p_to and r.quote_code = p_from and r.as_of <= p_as_of and r.rate <> 0
        order by r.as_of desc limit 1))
  end;
$$;

create or replace function convert_minor(
  p_amount bigint, p_from text, p_to text, p_as_of date default current_date
) returns bigint language plpgsql stable as $$
declare v_rate numeric; d_from smallint; d_to smallint;
begin
  if p_amount is null then return null; end if;
  if p_from = p_to then return p_amount; end if;
  v_rate := fx_rate(p_from, p_to, p_as_of);
  if v_rate is null then return null; end if;
  select decimal_digits into d_from from currencies where code = p_from;
  select decimal_digits into d_to   from currencies where code = p_to;
  if d_from is null or d_to is null then return null; end if;
  return round((p_amount::numeric / power(10::numeric, d_from)) * v_rate * power(10::numeric, d_to))::bigint;
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function budget_window(
  p_starts_on date, p_period budget_period, p_ends_on date, p_ref date,
  out win_start date, out win_end date
) language plpgsql immutable as $$
declare n integer := 0; step_next date;
begin
  if p_period = 'one_time' then
    win_start := p_starts_on;
    win_end := coalesce(p_ends_on, p_ref);
    return;
  end if;

  loop
    win_start := (p_starts_on + case p_period
        when 'weekly' then make_interval(weeks => n)
        when 'monthly' then make_interval(months => n)
        when 'quarterly' then make_interval(months => 3 * n)
        when 'yearly' then make_interval(years => n) end)::date;
    step_next := (p_starts_on + case p_period
        when 'weekly' then make_interval(weeks => n + 1)
        when 'monthly' then make_interval(months => n + 1)
        when 'quarterly' then make_interval(months => 3 * (n + 1))
        when 'yearly' then make_interval(years => n + 1) end)::date;
    exit when p_ref < step_next;
    n := n + 1;
    if n > 10000 then
      raise exception 'budget_window did not converge (starts_on=%, ref=%)', p_starts_on, p_ref;
    end if;
  end loop;

  win_end := step_next - 1;
  if p_ends_on is not null and win_end > p_ends_on then win_end := p_ends_on; end if;
end;
$$;

create or replace function budget_progress(p_ref date default current_date)
returns table (
  budget_id uuid, name text, currency_code text, amount_minor bigint,
  spent_minor bigint, rollover_minor bigint, win_start date, win_end date, missing_rate boolean
) language sql stable as $$
  with b as (
    select bd.*, w.win_start, w.win_end
      from budgets bd
      cross join lateral budget_window(bd.starts_on, bd.period, bd.ends_on, p_ref) w
     where bd.archived = false
       and bd.starts_on <= p_ref
       and (bd.ends_on is null or bd.ends_on >= p_ref)
  ),
  matched as (
    select b.id as budget_id,
           convert_minor(t.amount_minor, t.currency_code, b.currency_code, t.occurred_on) as conv
      from b
      join transactions t
        on t.type = 'expense'
       and t.status <> 'void'
       and t.occurred_on between b.win_start and b.win_end
      join accounts a on a.id = t.account_id and a.exclude_from_stats = false
     where (not exists (select 1 from budget_categories bc where bc.budget_id = b.id)
            or exists (select 1 from budget_categories bc
                        where bc.budget_id = b.id
                          and bc.category_id in (
                            t.category_id,
                            (select c.parent_id from categories c where c.id = t.category_id))))
       and (not exists (select 1 from budget_accounts ba where ba.budget_id = b.id)
            or exists (select 1 from budget_accounts ba
                        where ba.budget_id = b.id and ba.account_id = t.account_id))
  )
  select b.id, b.name, b.currency_code, b.amount_minor,
         coalesce(sum(m.conv), 0)::bigint, 0::bigint,
         b.win_start, b.win_end, bool_or(m.conv is null)
    from b left join matched m on m.budget_id = b.id
   group by b.id, b.name, b.currency_code, b.amount_minor, b.win_start, b.win_end;
$$;

create or replace function category_totals(
  p_from date, p_to date, p_currency text, p_kind category_kind default 'expense'
) returns table (
  category_id uuid, category_name text, color text, icon text,
  total_minor bigint, txn_count bigint
) language sql stable as $$
  select coalesce(parent.id, c.id),
         coalesce(parent.name, c.name, 'Uncategorized'),
         coalesce(parent.color, c.color, '#8E8E93'),
         coalesce(parent.icon, c.icon, 'tag'),
         coalesce(sum(convert_minor(t.amount_minor, t.currency_code, p_currency, t.occurred_on)), 0)::bigint,
         count(*)::bigint
    from transactions t
    join accounts a on a.id = t.account_id and a.exclude_from_stats = false
    left join categories c on c.id = t.category_id
    left join categories parent on parent.id = c.parent_id
   where t.status <> 'void'
     and t.type = (case p_kind when 'income' then 'income' else 'expense' end)::txn_type
     and t.occurred_on between p_from and p_to
   group by 1,2,3,4
   order by 5 desc;
$$;

create or replace function cashflow_series(
  p_from date, p_to date, p_currency text, p_bucket text default 'month'
) returns table (
  bucket_start date, income_minor bigint, expense_minor bigint, net_minor bigint
) language sql stable as $$
  with bounds as (
    select case lower(p_bucket)
             when 'day' then 'day' when 'week' then 'week'
             when 'year' then 'year' else 'month' end as unit
  ),
  buckets as (
    select generate_series(
             date_trunc((select unit from bounds), p_from::timestamp),
             date_trunc((select unit from bounds), p_to::timestamp),
             ('1 ' || (select unit from bounds))::interval)::date as bucket_start
  ),
  rows_in as (
    select date_trunc((select unit from bounds), t.occurred_on::timestamp)::date as bucket_start,
           t.type,
           convert_minor(t.amount_minor, t.currency_code, p_currency, t.occurred_on) as conv
      from transactions t
      join accounts a on a.id = t.account_id and a.exclude_from_stats = false
     where t.status <> 'void' and t.type in ('income','expense')
       and t.occurred_on between p_from and p_to
  )
  select b.bucket_start,
         coalesce(sum(r.conv) filter (where r.type = 'income'), 0)::bigint,
         coalesce(sum(r.conv) filter (where r.type = 'expense'), 0)::bigint,
         (coalesce(sum(r.conv) filter (where r.type = 'income'), 0)
          - coalesce(sum(r.conv) filter (where r.type = 'expense'), 0))::bigint
    from buckets b left join rows_in r on r.bucket_start = b.bucket_start
   group by b.bucket_start
   order by b.bucket_start;
$$;

create or replace function net_worth(p_currency text, p_as_of date default current_date)
returns table (
  assets_minor bigint, liabilities_minor bigint, net_minor bigint, missing_rate boolean
) language sql stable as $$
  with per_account as (
    select a.id, a.currency_code,
           (a.initial_balance_minor
             + coalesce(sum(l.delta_minor) filter (
                 where l.status <> 'void' and l.occurred_on <= p_as_of), 0))::bigint as bal
      from accounts a
      left join account_ledger l on l.account_id = a.id
     where a.archived = false and a.exclude_from_stats = false
     group by a.id
  ),
  conv as (select convert_minor(bal, currency_code, p_currency, p_as_of) as c from per_account)
  select coalesce(sum(c) filter (where c > 0), 0)::bigint,
         coalesce(-sum(c) filter (where c < 0), 0)::bigint,
         coalesce(sum(c), 0)::bigint,
         bool_or(c is null)
    from conv;
$$;

-- Post every due planned payment and move its schedule forward. Running it
-- twice cannot create the same transaction twice.
create or replace function generate_due_recurring(p_through date default current_date)
returns integer language plpgsql as $$
declare r record; created integer := 0; guard integer;
begin
  for r in
    select * from recurring_rules
     where archived = false and auto_create = true
       and next_occurrence_on <= p_through
       and (ends_on is null or next_occurrence_on <= ends_on)
     for update
  loop
    guard := 0;
    while r.next_occurrence_on <= p_through
      and (r.ends_on is null or r.next_occurrence_on <= r.ends_on)
    loop
      insert into transactions (
        type, account_id, transfer_account_id, category_id,
        amount_minor, currency_code, occurred_on, payee, note, status, recurring_rule_id
      ) values (
        r.type, r.account_id, r.transfer_account_id, r.category_id,
        r.amount_minor, r.currency_code, r.next_occurrence_on, r.payee, r.note, 'cleared', r.id
      );
      created := created + 1;
      r.next_occurrence_on := recurrence_next(r.starts_on, r.freq, r.interval_count, r.next_occurrence_on);
      guard := guard + 1;
      exit when guard > 500;
    end loop;

    update recurring_rules
       set next_occurrence_on = r.next_occurrence_on, last_generated_on = p_through
     where id = r.id;
  end loop;
  return created;
end;
$$;
