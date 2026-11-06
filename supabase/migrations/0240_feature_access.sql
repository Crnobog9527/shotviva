-- T29: who may use a new feature (ARCHITECTURE §6.2 "新功能抢先用"). One row per gated feature;
-- keys come from the code registry core/features/registry.ts and the server checks a key is
-- registered before writing. No row, or a null min_tier, means everyone may use it. Private:
-- RLS on with no policy, read and written through the service role only.

create table public.feature_access (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  min_tier text check (min_tier in ('pro', 'max')),
  -- From this moment on everyone may use the feature, whatever min_tier says.
  open_to_all_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

alter table public.feature_access enable row level security;

revoke all on public.feature_access from anon, authenticated;
grant select, insert, update on public.feature_access to service_role;
