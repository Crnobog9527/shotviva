-- Work collection sharing (ARCHITECTURE §6.2「作品集分享」, Owner 2026-11-22): a user picks several of
-- their own finished works and sends one link; the recipient sees them, optionally next to the
-- photos they were made from. One row per link. The works stay in generation_jobs; the link only
-- lists their ids in the sharer's order, so a work deleted later simply drops out of every link
-- that named it (the reads skip deleted works), and an account deletion takes its links with it.
--
-- Private table: the owner may read their own rows through RLS, but every write and the public
-- read go through the service-role functions of 1871, which check the owner and the works.

create table public.work_shares (
  -- 32 hex characters from gen_random_uuid (122 random bits): the link is the only key to it.
  id text primary key default replace(gen_random_uuid()::text, '-', '') check (id ~ '^[0-9a-f]{32}$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- In the sharer's order, no repeats; at most 30 works per link.
  job_ids uuid[] not null check (cardinality(job_ids) between 1 and 30 and array_position(job_ids, null) is null),
  -- Off unless the sharer turned on "show the original photos" for this link.
  show_before boolean not null default false,
  title text check (title is null or char_length(title) between 1 and 80),
  note text check (note is null or char_length(note) between 1 and 500),
  created_at timestamptz not null default now(),
  -- Set once by revoke_work_share; the link then answers like a missing one.
  revoked_at timestamptz
);

-- "My share links", newest first, cursor (created_at, id); also the per-user cap's count.
create index work_shares_user_created_idx on public.work_shares (user_id, created_at desc, id desc);

alter table public.work_shares enable row level security;

create policy "work_shares_select_own" on public.work_shares
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- No client writes; anon gets nothing.
revoke all on public.work_shares from public, anon, authenticated;
grant select on public.work_shares to authenticated;
