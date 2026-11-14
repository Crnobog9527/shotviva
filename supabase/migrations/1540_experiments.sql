-- A/B experiments run from /admin/experiments (Owner 2026-11-14, ARCHITECTURE §16.5). An experiment
-- tests one surface (the home hero, the pricing page, the paywall); its variants pick one of the
-- options the code defines for that surface (src/site/experiments), never free HTML and never a
-- price. Visitors are split in the proxy by a cookie; the split is kept on the account from sign-up.
-- At most one experiment per surface is running or paused at a time (experiments_live_surface_idx),
-- so two experiments never fight over the same block. An ended experiment keeps showing its winner
-- on its surface until another one starts there.
-- New tables only: nothing the deployed code reads changes.

create table public.experiments (
  id bigint generated always as identity primary key,
  surface text not null check (surface in ('hero', 'pricing', 'paywall')),
  name text not null check (length(name) between 1 and 80),
  goal text not null check (goal in ('signup', 'first_generation', 'payment')),
  status text not null default 'draft' check (status in ('draft', 'running', 'paused', 'ended')),
  -- Set when ended; the control when the admin picked none (admin_experiment_act).
  winner_variant_id bigint,
  started_at timestamptz,
  ended_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'draft') = (started_at is null)),
  check ((status = 'ended') = (ended_at is not null))
);

create unique index experiments_live_surface_idx on public.experiments (surface) where status in ('running', 'paused');
-- experiments_live(): the latest ended experiment of a surface without a live one.
create index experiments_ended_surface_idx on public.experiments (surface, ended_at desc) where status = 'ended';
-- The admin list, newest first.
create index experiments_created_at_id_idx on public.experiments (created_at desc, id desc);

alter table public.experiments enable row level security;
revoke all on table public.experiments from public, anon, authenticated;
-- Read by the admin page (service role); written only through the functions in 1543 and 1544.
grant select on table public.experiments to service_role;
