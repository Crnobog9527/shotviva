create table public.template_request_notices (
  user_id uuid not null references public.profiles (id) on delete cascade,
  request_id uuid not null references public.template_requests (id) on delete cascade,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  primary key (user_id, request_id)
);

create index template_request_notices_unread_idx
  on public.template_request_notices (user_id, created_at desc, request_id desc) where seen_at is null;
create index template_request_notices_request_idx on public.template_request_notices (request_id);

alter table public.template_request_notices enable row level security;
revoke all on public.template_request_notices from public, anon, authenticated, service_role;
grant select, update (seen_at) on public.template_request_notices to authenticated;
grant select, insert, update (seen_at) on public.template_request_notices to service_role;

create policy template_request_notices_select_own on public.template_request_notices
  for select to authenticated using (user_id = (select auth.uid()));
create policy template_request_notices_mark_own on public.template_request_notices
  for update to authenticated using (user_id = (select auth.uid()) and seen_at is null)
  with check (user_id = (select auth.uid()) and seen_at is not null);
