-- Invitation-only features (dense-text posters, phase 1): a feature the code registry marks
-- inviteOnly opens to the accounts listed here (and to admins) until its open_to_all_at passes.
-- Private like feature_access: RLS on with no policy, service role only. A grant goes with the
-- account when it is deleted.
create table public.feature_user_grants (
  feature_key text not null check (feature_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (feature_key, user_id)
);

alter table public.feature_user_grants enable row level security;

revoke all on public.feature_user_grants from anon, authenticated;
grant select on public.feature_user_grants to service_role;
