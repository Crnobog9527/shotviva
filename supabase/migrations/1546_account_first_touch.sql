-- First-touch attribution (Owner 2026-11-14, ARCHITECTURE §16.6): where an account's browser first
-- landed, copied once at sign-up or first sign-in from the sealed sv_ft cookie the proxy set. One
-- row per account, never changed afterwards. Typed, length-limited columns rather than a free JSON
-- blob, so the funnel can group by them and nothing else can be stored here.
-- New table only: nothing the deployed code reads changes.

create table public.account_first_touch (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- Path and query as landed, sensitive parameters already removed (/zh/t/x?utm_source=…).
  landing_path text not null check (length(landing_path) between 1 and 300 and left(landing_path, 1) = '/'),
  -- The referring site's host only, without www.; null for direct visits and our own pages.
  referrer_host text check (referrer_host ~ '^[a-z0-9.-]{1,100}$'),
  utm_source text check (length(utm_source) between 1 and 100),
  utm_medium text check (length(utm_medium) between 1 and 100),
  utm_campaign text check (length(utm_campaign) between 1 and 100),
  utm_term text check (length(utm_term) between 1 and 100),
  utm_content text check (length(utm_content) between 1 and 100),
  -- A template share link (/t/<template>?s=<share id>), the Graylum connect page, a promoter link.
  share_template_id text check (share_template_id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  share_id text check (share_id ~ '^[a-z0-9]{8}$'),
  graylum boolean not null default false,
  affiliate_slug text check (affiliate_slug ~ '^[a-z0-9-]{3,24}$'),
  -- When the visitor landed (from the cookie) and when the account row was written.
  landed_at timestamptz not null,
  recorded_at timestamptz not null default now()
);

alter table public.account_first_touch enable row level security;
revoke all on table public.account_first_touch from public, anon, authenticated;
-- An account may read its own row; nobody writes from a client. The admin reads it with the
-- service role; record_first_touch (1547) is the only writer.
grant select on table public.account_first_touch to authenticated;
create policy account_first_touch_own on public.account_first_touch for select to authenticated using (user_id = (select auth.uid()));
grant select on table public.account_first_touch to service_role;
