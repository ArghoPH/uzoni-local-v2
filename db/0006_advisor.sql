-- ============================================================================
-- Uzoni (local) — 0006_advisor.sql
-- Functions the advice features lean on: future occurrences of planned
-- payments, and per-category monthly history.
-- ============================================================================

/*
  Every planned payment that falls due between now and p_through, one row per
  occurrence. Anchored on each rule's start date, so a monthly rule beginning
  on the 31st stays on the 31st instead of drifting to the 28th.
*/
create or replace function upcoming_occurrences(p_through date)
returns table (
  rule_id uuid, name text, type txn_type, account_id uuid, transfer_account_id uuid,
  category_id uuid, amount_minor bigint, currency_code text, occurs_on date, auto_create boolean
) language plpgsql stable as $$
declare r record; d date; guard integer;
begin
  for r in select * from recurring_rules where archived = false loop
    d := r.next_occurrence_on;
    guard := 0;
    while d <= p_through and (r.ends_on is null or d <= r.ends_on) loop
      rule_id := r.id; name := r.name; type := r.type;
      account_id := r.account_id; transfer_account_id := r.transfer_account_id;
      category_id := r.category_id; amount_minor := r.amount_minor;
      currency_code := r.currency_code; occurs_on := d; auto_create := r.auto_create;
      return next;
      d := recurrence_next(r.starts_on, r.freq, r.interval_count, d);
      guard := guard + 1;
      exit when guard > 400;
    end loop;
  end loop;
end;
$$;

/*
  Spend per top-level category per calendar month, converted to one currency.
  Only months with activity come back; the caller fills the gaps with zero,
  which keeps this a single grouped scan rather than a cross join.
*/
create or replace function category_monthly(p_months integer, p_currency text)
returns table (
  category_id uuid, category_name text, color text, month_start date, total_minor bigint
) language sql stable as $$
  select coalesce(parent.id, c.id),
         coalesce(parent.name, c.name, 'Uncategorized'),
         coalesce(parent.color, c.color, '#8E8E93'),
         date_trunc('month', t.occurred_on)::date,
         coalesce(sum(convert_minor(t.amount_minor, t.currency_code, p_currency, t.occurred_on)), 0)::bigint
    from transactions t
    join accounts a on a.id = t.account_id and a.exclude_from_stats = false
    left join categories c on c.id = t.category_id
    left join categories parent on parent.id = c.parent_id
   where t.status <> 'void'
     and t.type = 'expense'
     and t.occurred_on >= (date_trunc('month', current_date)
                           - make_interval(months => greatest(p_months, 1) - 1))::date
   group by 1, 2, 3, 4
   order by 1, 4;
$$;

/*
  The typical size of an expense in a category, as a median rather than a mean
  so one outlier does not raise the bar that finds outliers.
*/
create or replace function category_typical(p_days integer, p_currency text)
returns table (category_id uuid, median_minor bigint, txn_count bigint)
language sql stable as $$
  select coalesce(parent.id, c.id),
         percentile_cont(0.5) within group (
           order by convert_minor(t.amount_minor, t.currency_code, p_currency, t.occurred_on)
         )::bigint,
         count(*)::bigint
    from transactions t
    join accounts a on a.id = t.account_id and a.exclude_from_stats = false
    left join categories c on c.id = t.category_id
    left join categories parent on parent.id = c.parent_id
   where t.status <> 'void'
     and t.type = 'expense'
     and t.occurred_on >= current_date - greatest(p_days, 1)
     and convert_minor(t.amount_minor, t.currency_code, p_currency, t.occurred_on) is not null
   group by 1;
$$;
