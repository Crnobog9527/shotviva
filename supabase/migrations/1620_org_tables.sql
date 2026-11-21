-- Enterprise base (ARCHITECTURE §6.5, card E1): companies buy a USD package offline, the platform
-- grants its credits to the org pool, the org owner hands them to members' own paid pools, and
-- the org's usage settings lift members' tier limits. Every table is private: RLS on, no policy,
-- clients have no grant; the service role only reads, and every write goes through a function.

-- Packages are priced in USD (Owner 2026-11-21): the price and the credits are stored as entered
-- in the admin, never derived from an exchange rate. Prices live only in each database.
create table public.org_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  price_usd_cents bigint not null check (price_usd_cents between 1 and 100000000000),
  credits integer not null check (credits between 1 and 1000000000),
  active boolean not null default true,
  sort integer not null default 0 check (sort between 0 and 1000),
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id)
);
alter table public.org_packages enable row level security;
revoke all on public.org_packages from public,anon,authenticated,service_role;
grant select on public.org_packages to service_role;

-- Usage columns: NULL (or 0 / false) = no lift over the member's own tier. They are checked
-- against system_settings.org_limit_caps when saved (admin_org_update) and clamped to it again
-- when read (effective_limits), so lowering a cap takes effect at once.
create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  owner_user_id uuid not null unique references public.profiles(id),
  status text not null default 'active' check (status in ('active','suspended')),
  concurrency integer check (concurrency >= 1),
  per_window integer check (per_window >= 1),
  batch_max integer check (batch_max >= 1),
  multi_template_max integer check (multi_template_max >= 0),
  batch_zip boolean not null default false,
  early_features boolean not null default false,
  affiliate_enabled boolean not null default false,
  affiliate_levels smallint not null default 1 check (affiliate_levels in (1,2)),
  invite_token text not null unique default replace(gen_random_uuid()::text,'-','')
    check (invite_token ~ '^[0-9a-f]{32}$'),
  pool_credits bigint not null default 0 check (pool_credits >= 0),
  admin_note text check (length(admin_note) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.orgs enable row level security;
revoke all on public.orgs from public,anon,authenticated,service_role;
grant select on public.orgs to service_role;

-- held_credits: credits the org moved into this member's paid pool that still count as the
-- org's. The member's own purchases are spent last, so what the org can take back is
-- min(held_credits, profiles.credits). A removed row is kept (history); rejoining the same org
-- reactivates it. One active membership per account, in any org.
create table public.org_members (
  org_id uuid not null references public.orgs(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner','member')),
  monthly_allowance integer not null default 0 check (monthly_allowance between 0 and 1000000000),
  held_credits integer not null default 0 check (held_credits >= 0),
  status text not null default 'active' check (status in ('active','removed')),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (org_id, user_id),
  constraint org_members_removed_at check ((status = 'removed') = (removed_at is not null))
);
create unique index org_members_one_active_idx on public.org_members(user_id) where status = 'active';
-- The member list and the monthly top-up walk an org's active members in join order.
create index org_members_org_active_idx on public.org_members(org_id, joined_at, user_id) where status = 'active';
alter table public.org_members enable row level security;
revoke all on public.org_members from public,anon,authenticated,service_role;
grant select on public.org_members to service_role;

-- Every pool movement. request_id is the idempotency key: a replay with the same request does
-- nothing, a different request under the same id is IDEMPOTENCY_CONFLICT. amount_cny_fen is
-- only the CNY actually received for a bank_grant, kept as a reference (FX is settled offline).
create table public.org_credit_ledger (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs(id),
  kind text not null check (kind in ('bank_grant','owner_deposit','allocate','reclaim','admin_adjust')),
  delta bigint not null check (delta <> 0),
  pool_after bigint not null check (pool_after >= 0),
  member_user_id uuid references public.profiles(id) on delete set null,
  package_id uuid references public.org_packages(id),
  request_id text not null unique check (length(request_id) between 1 and 200),
  amount_cny_fen bigint check (amount_cny_fen >= 0),
  reference text check (length(reference) <= 200),
  note text check (length(note) <= 2000),
  actor uuid,
  created_at timestamptz not null default now()
);
create index org_credit_ledger_org_idx on public.org_credit_ledger(org_id, created_at desc, id desc);
alter table public.org_credit_ledger enable row level security;
revoke all on public.org_credit_ledger from public,anon,authenticated,service_role;
grant select on public.org_credit_ledger to service_role;
revoke all on sequence public.org_credit_ledger_id_seq from public,anon,authenticated,service_role;

-- One row per member per month the monthly top-up has looked at, written in the same transaction
-- as the grant (granted may be 0 when the member was already at the allowance; short is what the
-- pool could not cover). Its key is what makes org_monthly_topup(period) safe to re-run: a member
-- is topped up at most once per period, even after spending and even after the pool is refilled
-- (the owner allocates the shortfall by hand).
create table public.org_member_topups (
  org_id uuid not null references public.orgs(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  granted integer not null check (granted >= 0),
  short integer not null default 0 check (short >= 0),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id, period)
);
alter table public.org_member_topups enable row level security;
revoke all on public.org_member_topups from public,anon,authenticated,service_role;
grant select on public.org_member_topups to service_role;
