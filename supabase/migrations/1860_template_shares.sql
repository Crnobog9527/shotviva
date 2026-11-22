-- Template collection share links (ARCHITECTURE §5.1g, Owner 2026-11-22): a member picks
-- several templates and series on Create and sends one link (/s/t/<id>) to a client, who sees
-- only those, in the order picked, and can start any of them.
--
-- One row per link. `id` is the unguessable 12-character link id; `items` the picked entries in
-- order ([{"type":"template","id":"<template id>"} | {"type":"series","id":"<series uuid>"}],
-- checked in full by template_share_create, 1861). Rows outlive templates going offline: the
-- page resolves them against the live catalogue, so an unpublished one simply drops out.
--
-- Clients only read their own rows (the "my share links" list); creating and revoking go
-- through the 1861 functions, called by the server with the signed-in user's id. The public
-- page reads one row by id on the server (service role), never from the browser.
--
-- Expand-only: a new table, nothing existing changes.

create table public.template_shares (
  id text collate "C" primary key check (id ~ '^[a-z0-9]{12}$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 50),
  title text check (title is null or char_length(title) between 1 and 80),
  note text check (note is null or char_length(note) between 1 and 500),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (revoked_at is null or revoked_at >= created_at)
);

-- "My share links" newest first, keyset (created_at, id); also the creation rate limit's count
-- and the account-deletion cascade.
create index template_shares_user_created_idx on public.template_shares (user_id, created_at desc, id desc);
-- The admin analytics count of links made in a period (admin_template_share_stats, 1862).
create index template_shares_created_idx on public.template_shares (created_at);

alter table public.template_shares enable row level security;

create policy "template_shares_select_own" on public.template_shares
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- No client writes (no insert/update/delete policy or grant): 1861's functions do them. The
-- server reads a link by id for the public page (service role, read only).
revoke all on public.template_shares from public, anon, authenticated, service_role;
grant select on public.template_shares to authenticated, service_role;
