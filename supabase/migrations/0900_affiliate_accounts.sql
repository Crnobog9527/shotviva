-- T95. No client policies: the server authenticates the caller and scoped functions perform writes.
create table public.affiliates (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  slug text collate "C" not null unique check (slug ~ '^[a-z0-9-]{3,24}$' and slug not in ('admin','api','www','shotviva','partners','support')),
  status text not null default 'pending' check (status in ('pending','active','rejected','suspended','banned')),
  parent_user_id uuid references public.affiliates(user_id) on delete set null check (parent_user_id <> user_id),
  team_enabled boolean not null default false,
  country text,
  payout_method text check (payout_method in ('paypal','wise','bank','alipay','other')),
  payout_details text,
  us_person boolean,
  terms_version text,
  terms_accepted_at timestamptz,
  application jsonb not null default '{}',
  reject_reason text,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  admin_note text,
  created_at timestamptz not null default now()
);
create index affiliates_parent_created_idx on public.affiliates(parent_user_id,created_at desc,slug desc) where parent_user_id is not null;
create index affiliates_status_created_idx on public.affiliates(status,created_at desc,user_id desc);
create index affiliates_created_idx on public.affiliates(created_at desc,user_id desc);
alter table public.affiliates enable row level security;
revoke all on public.affiliates from public,anon,authenticated,service_role;
grant select on public.affiliates to service_role;

alter table public.profiles
  add column referred_by uuid references public.affiliates(user_id) on delete set null,
  add column referred_at timestamptz,
  add column referred_source text check (referred_source in ('signup','first_checkout','admin'));
create index profiles_referred_by_idx on public.profiles(referred_by,referred_at desc,id desc) where referred_by is not null;
