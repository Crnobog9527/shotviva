-- T9: the nine products of ARCHITECTURE §6.2 replace the placeholder 'pass' / 'pack'.
-- apply_purchase reads credits and days from here; site.config.ts holds the same numbers for
-- the pages (tests/db/stripe-catalog.test.ts keeps the two equal). Memberships carry days
-- (+30 monthly, +365 yearly); packs have none and never touch paid_until (§6.1).
-- No purchase has been settled with the placeholder ids, so their rows are simply replaced.

alter table public.products drop constraint products_id_check;

delete from public.products where id in ('pass', 'pack');

alter table public.products add constraint products_id_check check (id in (
  'starter_monthly', 'starter_yearly',
  'pro_monthly', 'pro_yearly',
  'max_monthly', 'max_yearly',
  'pack_s', 'pack_m', 'pack_l'
));

insert into public.products (id, credits, days, price_usd) values
  ('starter_monthly', 50, 30, 19.90),
  ('starter_yearly', 600, 365, 139.00),
  ('pro_monthly', 135, 30, 49.90),
  ('pro_yearly', 1620, 365, 349.00),
  ('max_monthly', 280, 30, 99.00),
  ('max_yearly', 3360, 365, 699.00),
  ('pack_s', 20, null, 9.90),
  ('pack_m', 55, null, 24.90),
  ('pack_l', 115, null, 49.90);
