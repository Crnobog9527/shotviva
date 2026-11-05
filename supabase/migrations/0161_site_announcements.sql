-- T23: the site-wide top banner (ARCHITECTURE §10). Text for both languages lives here, not in
-- site/messages, so the Owner changes it without a deploy. Private: RLS on, no client role can
-- read or write; the server reads the live row through the service role and caches it.

create table public.site_announcements (
  id uuid primary key default gen_random_uuid(),
  message_en text not null check (char_length(message_en) between 1 and 140),
  message_zh text not null check (char_length(message_zh) between 1 and 140),
  -- A site path ("/pricing", never "//host") or an https URL without userinfo.
  link_url text check (
    link_url is null
    or (char_length(link_url) <= 500
        and (link_url ~ '^/([^/\s]\S*)?$' or link_url ~ '^https://[^\s/?#@]+([/?#]\S*)?$'))
  ),
  link_label_en text check (link_label_en is null or char_length(link_label_en) between 1 and 40),
  link_label_zh text check (link_label_zh is null or char_length(link_label_zh) between 1 and 40),
  tone text not null default 'info' check (tone in ('info', 'promo')),
  -- Null start = since forever, null end = until switched off. The window is [starts_at, ends_at).
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint site_announcements_window_order check (starts_at is null or ends_at is null or starts_at < ends_at),
  -- At most one live banner at any instant: active windows never overlap. Editing an active row
  -- into an overlap is refused here; admin_activate_announcement switches instead of failing.
  constraint site_announcements_active_no_overlap exclude using gist (
    tstzrange(coalesce(starts_at, '-infinity'::timestamptz), coalesce(ends_at, 'infinity'::timestamptz)) with &&
  ) where (is_active)
);

-- The admin list: newest first, keyset on (created_at, id).
create index site_announcements_created_at_id_idx on public.site_announcements (created_at desc, id desc);

create trigger site_announcements_set_updated_at
  before update on public.site_announcements
  for each row execute function public.set_updated_at();

alter table public.site_announcements enable row level security;

revoke all on public.site_announcements from anon, authenticated;
grant select, insert, update on public.site_announcements to service_role;
