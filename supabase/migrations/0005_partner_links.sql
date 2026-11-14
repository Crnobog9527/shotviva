-- Baseline (T15): partner connections (ARCHITECTURE §14.2). One row per user and partner.
-- The row's user_id is the account_id Graylum stores; Graylum never holds a Shotviva token.
--
-- Lifecycle:
--   authorize  → link_code = sha256(code), code_expires_at = now() + 10 min
--   exchange   → link_code / code_expires_at cleared (single use), linked_at = now(), revoked_at = null
--   disconnect → revoked_at = now()
-- A link is live when linked_at is set and revoked_at is null.
create table public.partner_links (
  user_id uuid not null references public.profiles (id) on delete cascade,
  partner text not null check (partner in ('graylum')),
  -- Hex sha256 of the one-time code, never the code itself: a leaked row cannot be replayed.
  link_code text check (link_code ~ '^[0-9a-f]{64}$'),
  code_expires_at timestamptz,
  linked_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, partner),
  check ((link_code is null) = (code_expires_at is null))
);

-- The exchange looks codes up across all users.
create unique index partner_links_partner_link_code_idx
  on public.partner_links (partner, link_code)
  where link_code is not null;

alter table public.partner_links enable row level security;

-- The account page shows "Connected / Disconnect" from the user's own rows. Every write
-- (authorize, exchange, disconnect) runs server-side with the service role.
create policy "partner_links_select_own" on public.partner_links
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.partner_links from anon, authenticated;
grant select (user_id, partner, linked_at, revoked_at, created_at) on public.partner_links to authenticated;
grant select, insert, update on public.partner_links to service_role;
