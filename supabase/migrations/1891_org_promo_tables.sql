-- Two private tables for the enterprise promotion pool (ARCHITECTURE §6.5 企业推广积分池). RLS on, no
-- policy, clients have no grant; the service role only reads; writes only through the functions.

-- How much of the org's promotion share each free-pool debit of a member took (like org_held_draws
-- for the paid share), keyed by the debit's idempotency key. period is the UTC month of the debit:
-- a refund of it gives the share back only within that month, while the member is still in the org;
-- after the month the refunded part expires at once.
create table public.org_promo_draws (
  debit_key text primary key,
  org_id uuid not null references public.orgs(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  drawn integer not null check (drawn > 0),
  restored integer not null default 0 check (restored between 0 and drawn),
  created_at timestamptz not null default now()
);
-- The member report (used this month) reads an org's draws by month.
create index org_promo_draws_org_period_idx on public.org_promo_draws(org_id, period);
alter table public.org_promo_draws enable row level security;
revoke all on public.org_promo_draws from public, anon, authenticated, service_role;
grant select on public.org_promo_draws to service_role;

-- What the promotion allowance has given each member in a UTC month. granted only grows; each
-- later run (a new grant, a top-up, a changed allowance) gives the rest up to the allowance while
-- the pool has it, so a month's allowance is never given twice.
create table public.org_member_promo_topups (
  org_id uuid not null references public.orgs(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  granted integer not null default 0 check (granted >= 0),
  short integer not null default 0 check (short >= 0),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id, period)
);
alter table public.org_member_promo_topups enable row level security;
revoke all on public.org_member_promo_topups from public, anon, authenticated, service_role;
grant select on public.org_member_promo_topups to service_role;
