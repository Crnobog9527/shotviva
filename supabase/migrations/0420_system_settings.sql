-- T62: site-wide runtime switches the Owner flips in the admin (ARCHITECTURE §15.6). One row
-- per setting; the keys the database accepts are listed in admin_set_system_setting (0421),
-- and the code reads them through core/system-settings. No row means the setting's default
-- (wishlist_enabled: off). Private: RLS on with no policy, read and written through the
-- service role only.

create table public.system_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

alter table public.system_settings enable row level security;

revoke all on public.system_settings from anon, authenticated;
grant select, insert, update on public.system_settings to service_role;
