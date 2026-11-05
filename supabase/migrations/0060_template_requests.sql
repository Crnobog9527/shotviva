-- T12: template wishlist tables (ARCHITECTURE §15.3). Users ask for templates and vote; the
-- Owner reviews in the admin. Clients only read (RLS below); every write goes through the
-- security-definer functions in 0061 / 0062, called with the service role.
--
-- Status machine (§15.1): pending -> live -> shipped, pending -> rejected, live -> rejected.

create table public.template_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  description text not null check (char_length(btrim(description)) between 1 and 300),
  -- requests/{user_id}/{uuid}.jpg. Emptied once the images are deleted on reject / removal.
  image_keys text[] not null,
  status text not null default 'pending' check (status in ('pending', 'live', 'shipped', 'rejected')),
  -- Templates are never deleted (generation_jobs restricts too), so restrict here as well.
  template_id text references public.templates (id) on delete restrict,
  -- Sum of the vote weights, kept by the trigger below.
  votes_count integer not null default 0 check (votes_count >= 0),
  -- The only author identity the wall shows: first letter + '***', set once when posting.
  author_label text not null check (author_label ~ '^.\*\*\*$'),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint template_requests_images check (
    case when status = 'rejected' then cardinality(image_keys) = 0
         else cardinality(image_keys) between 1 and 3 end
  ),
  constraint template_requests_shipped_template check ((status = 'shipped') = (template_id is not null)),
  constraint template_requests_reviewed check ((status = 'pending') = (reviewed_at is null))
);

-- The wall (core/wishlist/wall.ts): one keyset page per status, shipped before live, each
-- by votes, then newest, then id as the tie-breaker (AGENTS §5.1 rule 4).
create index template_requests_wall_idx
  on public.template_requests (status, votes_count desc, created_at desc, id desc);

-- My requests (keyset on created_at, id) and the 5-per-24h posting limit; also serves the
-- account-deletion cascade on user_id.
create index template_requests_user_id_created_at_idx
  on public.template_requests (user_id, created_at desc, id desc);

-- The admin review page: the newest requests of each status.
create index template_requests_status_created_at_idx
  on public.template_requests (status, created_at desc);

create table public.template_request_votes (
  request_id uuid not null references public.template_requests (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- The weight at vote time (current_tier: Max 3, everyone else 1), so taking the vote back
  -- removes exactly what it added even if the tier changed in between.
  weight smallint not null check (weight in (1, 3)),
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

create index template_request_votes_user_id_idx on public.template_request_votes (user_id);

-- votes_count follows the vote rows, whoever adds or removes them: the toggle function, and
-- the cascade when a voter deletes their account. Security definer because the cascade runs
-- from auth's own role, which has no rights on template_requests.
create function public.template_request_votes_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.template_requests set votes_count = votes_count + new.weight where id = new.request_id;
  else
    update public.template_requests set votes_count = votes_count - old.weight where id = old.request_id;
  end if;
  return null;
end;
$$;

revoke execute on function public.template_request_votes_count() from public, anon, authenticated;

create trigger template_request_votes_count
  after insert or delete on public.template_request_votes
  for each row execute function public.template_request_votes_count();

alter table public.template_requests enable row level security;
alter table public.template_request_votes enable row level security;

-- The wall is for signed-in users only; pending and rejected requests only for their author
-- and admins (§15.3). The admin page itself reads through the service role
-- (admin_list_template_requests); the admin clause keeps a signed-in admin's own session
-- consistent with that. profiles RLS lets each user read only their own row, which is all
-- this check needs.
create policy "template_requests_select_visible" on public.template_requests
  for select to authenticated
  using (
    status in ('live', 'shipped')
    or (select auth.uid()) = user_id
    or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  );

-- Only the "voted" state of the viewer's own votes; nobody sees who else voted.
create policy "template_request_votes_select_own" on public.template_request_votes
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.template_requests from anon, authenticated;
revoke all on public.template_request_votes from anon, authenticated;
grant select on public.template_requests to authenticated, service_role;
grant select on public.template_request_votes to authenticated, service_role;
