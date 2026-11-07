-- T81 (ARCHITECTURE §5.1a 「留痕」): one row per request refused for asking to swap a face or turn
-- someone into a real person. The refusal happens before reserve_credits, so no job row exists;
-- this is the only trace besides the `generate_refused` event (which carries no text).
--
--   entry    where the words were typed: 'workspace' (note or template text fields), 'edit'
--            (a photo edit), 'partner' (the partner API, e.g. Graylum's freeform prompt)
--   method   what refused it: 'keyword' (the list in code) or 'model' (the decision provider)
--   excerpt  the first 200 characters of what was typed, for the Owner deciding on a ban
--
-- Kept 90 days: record_identity_refusal (0701) deletes older rows as it writes a new one, and
-- every read only looks at the last 90 days. Private: RLS on with no policy, reached only
-- through the 0701 functions with the service role.

create table public.identity_refusals (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  entry text not null check (entry in ('workspace', 'edit', 'partner')),
  method text not null check (method in ('keyword', 'model')),
  excerpt text not null check (char_length(excerpt) between 1 and 200),
  created_at timestamptz not null default now()
);

-- Per-account counts (admin detail and the list's 24-hour flag); the 90-day sweep.
create index identity_refusals_user_id_created_at_idx on public.identity_refusals (user_id, created_at desc);
create index identity_refusals_created_at_idx on public.identity_refusals (created_at);

alter table public.identity_refusals enable row level security;

revoke all on public.identity_refusals from public, anon, authenticated;
grant select, insert, delete on public.identity_refusals to service_role;
