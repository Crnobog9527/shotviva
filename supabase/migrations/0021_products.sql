-- The two one-time SKUs (ARCHITECTURE §6.2). Only what apply_purchase needs to settle a
-- purchase lives here; public prices are read from site.config.ts. price_usd stays 0
-- until pricing is final, and channel (Stripe / Waffo) mapping comes with the payment cards.
create table public.products (
  id text primary key check (id in ('pass', 'pack')),
  credits integer not null check (credits > 0),
  days integer not null check (days > 0),
  price_usd numeric(10, 2) not null default 0 check (price_usd >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;

revoke all on public.products from anon, authenticated;
-- Server-side reads only (support, debugging); writes go through SQL functions.
grant select on public.products to service_role;

insert into public.products (id, credits, days, price_usd) values
  ('pass', 30, 30, 0),
  ('pack', 120, 365, 0);
