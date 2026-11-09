-- Versioned terms for new purchases. Existing rows in public.products describe legacy
-- contracts and are not overwritten. No balance or external subscription changes here.
create table admin.product_terms_v2 (
  product_id text primary key references public.products(id),
  credits integer not null check (credits > 0),
  usd_cents integer not null check (usd_cents > 0)
);
alter table admin.product_terms_v2 enable row level security;
revoke all on admin.product_terms_v2 from public, anon, authenticated;
insert into admin.product_terms_v2(product_id, credits, usd_cents) values
  ('starter_monthly',1990,1990),('starter_yearly',23880,19104),
  ('pro_monthly',6000,4990),('pro_yearly',72000,47904),
  ('max_monthly',14000,9900),('max_yearly',168000,89100),
  ('pack_s',990,990),('pack_m',2490,2490),('pack_l',4990,4990);
