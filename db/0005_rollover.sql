-- ============================================================================
-- Uzoni (local) — 0005_rollover.sql
-- Budgets declared `rollover` now actually carry unspent money forward, and
-- overspending forward too. Re-runnable: it replaces the function in place.
-- ============================================================================

-- What one budget spent inside one window. Pulled out so both the current
-- window and the historical ones use exactly the same matching rules.
create or replace function budget_spent(p_budget_id uuid, p_from date, p_to date)
returns table (spent_minor bigint, missing_rate boolean)
language sql stable as $$
  with b as (select * from budgets where id = p_budget_id),
  matched as (
    select convert_minor(t.amount_minor, t.currency_code, b.currency_code, t.occurred_on) as conv
      from b
      join transactions t
        on t.type = 'expense'
       and t.status <> 'void'
       and t.occurred_on between p_from and p_to
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
  select coalesce(sum(conv), 0)::bigint, coalesce(bool_or(conv is null), false) from matched;
$$;

/*
  Carry-over into the window containing p_ref.

  Each earlier window contributes (budget − spent): a spare taka moves forward,
  and so does an overspent one, which is the point — a rollover budget that is
  only ever generous would hide the overspending it is meant to surface.

  Capped at 24 windows so a budget started years ago cannot turn one dashboard
  query into hundreds of scans.
*/
create or replace function budget_rollover(p_budget_id uuid, p_ref date)
returns bigint
language plpgsql stable as $$
declare
  b record;
  w record;
  cur_start date;
  carry bigint := 0;
  spent bigint;
  n integer := 0;
begin
  select * into b from budgets where id = p_budget_id;
  if b is null or b.rollover = false or b.period = 'one_time' then
    return 0;
  end if;

  select win_start into cur_start from budget_window(b.starts_on, b.period, b.ends_on, p_ref);

  -- Walk backwards from the window before the current one.
  loop
    n := n + 1;
    exit when n > 24;

    select * into w from budget_window(
      b.starts_on, b.period, b.ends_on,
      (cur_start - 1)::date
    );
    exit when w.win_start is null or w.win_start < b.starts_on or w.win_end < b.starts_on;

    select bs.spent_minor into spent from budget_spent(b.id, w.win_start, w.win_end) bs;
    carry := carry + (b.amount_minor - spent);

    cur_start := w.win_start;
    exit when cur_start <= b.starts_on;
  end loop;

  return carry;
end;
$$;

-- budget_progress now reports the carry-over instead of a hardcoded zero.
create or replace function budget_progress(p_ref date default current_date)
returns table (
  budget_id uuid, name text, currency_code text, amount_minor bigint,
  spent_minor bigint, rollover_minor bigint, win_start date, win_end date, missing_rate boolean
) language sql stable as $$
  select b.id, b.name, b.currency_code, b.amount_minor,
         s.spent_minor,
         case when b.rollover then budget_rollover(b.id, p_ref) else 0::bigint end,
         w.win_start, w.win_end,
         s.missing_rate
    from budgets b
    cross join lateral budget_window(b.starts_on, b.period, b.ends_on, p_ref) w
    cross join lateral budget_spent(b.id, w.win_start, w.win_end) s
   where b.archived = false
     and b.starts_on <= p_ref
     and (b.ends_on is null or b.ends_on >= p_ref);
$$;
