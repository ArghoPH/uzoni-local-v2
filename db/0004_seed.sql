-- ============================================================================
-- Uzoni (local) — 0004_seed.sql
-- Reference currencies, the one settings row, and the starting category tree.
-- Safe to run more than once: nothing is duplicated.
-- ============================================================================

insert into currencies (code, name, symbol, decimal_digits) values
  ('BDT', 'Bangladeshi Taka',   '৳',  2),
  ('USD', 'US Dollar',          '$',  2),
  ('EUR', 'Euro',               '€',  2),
  ('GBP', 'Pound Sterling',     '£',  2),
  ('INR', 'Indian Rupee',       '₹',  2),
  ('PKR', 'Pakistani Rupee',    '₨',  2),
  ('SAR', 'Saudi Riyal',        '﷼',  2),
  ('AED', 'UAE Dirham',         'د.إ', 2),
  ('MYR', 'Malaysian Ringgit',  'RM', 2),
  ('SGD', 'Singapore Dollar',   'S$', 2),
  ('AUD', 'Australian Dollar',  'A$', 2),
  ('CAD', 'Canadian Dollar',    'C$', 2),
  ('JPY', 'Japanese Yen',       '¥',  0),
  ('CNY', 'Chinese Yuan',       '¥',  2),
  ('TRY', 'Turkish Lira',       '₺',  2),
  ('CHF', 'Swiss Franc',        'CHF',2),
  ('SEK', 'Swedish Krona',      'kr', 2),
  ('NOK', 'Norwegian Krone',    'kr', 2),
  ('CZK', 'Czech Koruna',       'Kč', 2),
  ('PLN', 'Polish Zloty',       'zł', 2),
  ('ZAR', 'South African Rand', 'R',  2),
  ('NGN', 'Nigerian Naira',     '₦',  2),
  ('KES', 'Kenyan Shilling',    'KSh',2),
  ('EGP', 'Egyptian Pound',     'E£', 2),
  ('IDR', 'Indonesian Rupiah',  'Rp', 2),
  ('THB', 'Thai Baht',          '฿',  2),
  ('PHP', 'Philippine Peso',    '₱',  2),
  ('VND', 'Vietnamese Dong',    '₫',  0),
  ('KRW', 'South Korean Won',   '₩',  0),
  ('LKR', 'Sri Lankan Rupee',   'Rs', 2),
  ('NPR', 'Nepalese Rupee',     'Rs', 2),
  ('BRL', 'Brazilian Real',     'R$', 2),
  ('MXN', 'Mexican Peso',       'MX$',2),
  ('RUB', 'Russian Ruble',      '₽',  2),
  ('UAH', 'Ukrainian Hryvnia',  '₴',  2),
  ('QAR', 'Qatari Riyal',       'QR', 2),
  ('KWD', 'Kuwaiti Dinar',      'KD', 3),
  ('BHD', 'Bahraini Dinar',     'BD', 3),
  ('OMR', 'Omani Rial',         'OMR',3)
on conflict (code) do nothing;

insert into settings (id) values (1) on conflict (id) do nothing;

create or replace function seed_default_categories()
returns void language plpgsql as $$
declare
  spec jsonb := '[
    {"name":"Food & Drinks","kind":"expense","color":"#F97316","icon":"utensils",
     "children":["Groceries","Restaurant","Cafe","Bar","Fast food"]},
    {"name":"Shopping","kind":"expense","color":"#EC4899","icon":"shopping-bag",
     "children":["Clothes & shoes","Electronics","Home & garden","Gifts","Pharmacy","Pets"]},
    {"name":"Housing","kind":"expense","color":"#8B5CF6","icon":"home",
     "children":["Rent","Mortgage","Utilities","Internet","Maintenance","Service charge"]},
    {"name":"Transport","kind":"expense","color":"#0EA5E9","icon":"bus",
     "children":["Fuel","Public transport","Ride hailing","Parking","Vehicle maintenance"]},
    {"name":"Bills & Fees","kind":"expense","color":"#64748B","icon":"receipt",
     "children":["Mobile recharge","Subscriptions","Bank fees","Insurance","Taxes","Fines"]},
    {"name":"Health","kind":"expense","color":"#10B981","icon":"heart-pulse",
     "children":["Doctor","Medicine","Fitness","Dental"]},
    {"name":"Entertainment","kind":"expense","color":"#F43F5E","icon":"clapperboard",
     "children":["Streaming","Events","Hobbies","Travel","Sports"]},
    {"name":"Education","kind":"expense","color":"#6366F1","icon":"graduation-cap",
     "children":["Tuition","Books","Courses"]},
    {"name":"Family","kind":"expense","color":"#D946EF","icon":"users",
     "children":["Childcare","Allowance","Family support"]},
    {"name":"Financial","kind":"expense","color":"#475569","icon":"landmark",
     "children":["Loan repayment","Interest","Charity","Investment"]},
    {"name":"Other expense","kind":"expense","color":"#8E8E93","icon":"circle-dashed",
     "children":[]},

    {"name":"Salary","kind":"income","color":"#22C55E","icon":"briefcase",
     "children":["Monthly salary","Bonus","Overtime"]},
    {"name":"Business","kind":"income","color":"#14B8A6","icon":"store",
     "children":["Sales","Freelance","Commission"]},
    {"name":"Investments","kind":"income","color":"#84CC16","icon":"trending-up",
     "children":["Dividends","Interest earned","Capital gains"]},
    {"name":"Gifts & Refunds","kind":"income","color":"#F59E0B","icon":"gift",
     "children":["Gift received","Refund","Cashback","Remittance"]},
    {"name":"Other income","kind":"income","color":"#8E8E93","icon":"circle-dashed",
     "children":[]}
  ]'::jsonb;
  grp jsonb; child text; parent uuid; pos integer := 0; child_pos integer;
begin
  if exists (select 1 from categories) then return; end if;

  for grp in select * from jsonb_array_elements(spec)
  loop
    insert into categories (name, kind, color, icon, position, is_system)
    values (grp->>'name', (grp->>'kind')::category_kind, grp->>'color', grp->>'icon',
            pos, grp->>'name' in ('Other expense','Other income'))
    returning id into parent;

    child_pos := 0;
    for child in select jsonb_array_elements_text(grp->'children')
    loop
      insert into categories (parent_id, name, kind, color, icon, position)
      values (parent, child, (grp->>'kind')::category_kind, grp->>'color', grp->>'icon', child_pos);
      child_pos := child_pos + 1;
    end loop;

    pos := pos + 1;
  end loop;
end;
$$;

select seed_default_categories();
