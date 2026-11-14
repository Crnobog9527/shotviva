-- 店铺信息 (ARCHITECTURE §5.3「每周复用」): a signed-in user's store name, phones, address, WeChat
-- and QR code, saved once and filled into poster templates with matching fields. One row per
-- account, removed with it. The owner reads their own row; only the server writes it, because the
-- QR key must be a copy the server made under the owner's own outputs/ prefix (checked again here).
create table public.store_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 24),
  name_en text not null default '' check (char_length(name_en) <= 48),
  phones text[] not null default '{}' check (cardinality(phones) <= 3 and char_length(array_to_string(phones, '')) <= 60),
  address text not null default '' check (char_length(address) <= 60),
  wechat text not null default '' check (char_length(wechat) <= 40),
  qr_key text check (
    qr_key is null
    or qr_key ~ ('^outputs/' || user_id::text || '/store-qr-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$')
  ),
  -- Off: the editors offer 「填入店铺信息」 instead of filling it in when a template opens.
  autofill boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.store_profiles enable row level security;
revoke all on public.store_profiles from public, anon, authenticated, service_role;
grant select on public.store_profiles to authenticated;
grant select, insert, update, delete on public.store_profiles to service_role;

create policy store_profiles_select_own on public.store_profiles
  for select to authenticated using (user_id = (select auth.uid()));
