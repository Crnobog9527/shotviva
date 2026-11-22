-- Org default monthly allowances and bulk actions (ARCHITECTURE §6.5 企业推广积分池「默认额度与批量」,
-- the Owner 2026-11-22): an owner with many staff sets one default per kind instead of every member
-- by hand, and sets or gives to many members at once. This file only adds structure.

-- The default monthly allowance of each kind for every member without a personal setting
-- (including people who join later). 0 = none.
alter table public.orgs
  add column default_paid_allowance integer not null default 0 check (default_paid_allowance between 0 and 1000000000),
  add column default_promo_allowance integer not null default 0 check (default_promo_allowance between 0 and 1000000000);

-- Whether the member's own allowance of that kind is used (true) or the org default (false).
-- NULL (every row before this migration, and new joiners): an allowance above 0 counts as a
-- personal setting, 0 as "use the default" (so no existing row has to be rewritten).
alter table public.org_members
  add column paid_allowance_custom boolean,
  add column promo_allowance_custom boolean;

-- The owner's bulk actions and default changes, one row per request (the idempotency key and the
-- audit trail: who, what, for how many, and the credits it took from the pool). Private.
create table public.org_bulk_actions (
  request_id text primary key check (length(request_id) between 1 and 200),
  org_id uuid not null references public.orgs(id),
  actor uuid not null references public.profiles(id),
  action text not null check (action in ('set_allowance', 'grant', 'set_defaults')),
  members integer not null check (members >= 0),
  total bigint not null default 0 check (total >= 0),
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index org_bulk_actions_org_idx on public.org_bulk_actions(org_id, created_at desc);
alter table public.org_bulk_actions enable row level security;
revoke all on public.org_bulk_actions from public, anon, authenticated, service_role;
grant select on public.org_bulk_actions to service_role;
