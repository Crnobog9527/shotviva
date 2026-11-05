-- One row per generation (ARCHITECTURE §4); video will reuse the table.
-- template_id has no FK yet: T3 owns `templates` and adds the constraint in its own migration.
create table public.generation_jobs (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  module text not null check (module in ('image', 'video')),
  template_id text not null,
  inputs jsonb not null default '{}'::jsonb,
  provider text,
  source text not null check (source in ('web', 'graylum')),
  idempotency_key text,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  visibility text not null check (visibility in ('public', 'private')),
  credits_cost integer not null check (credits_cost > 0),
  output_key text,
  error_code text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  check ((status = 'running') = (finished_at is null)),
  check (status <> 'succeeded' or output_key is not null)
);

-- Scoped per user so one partner's callId can never resolve to another user's job.
create unique index generation_jobs_user_idempotency_key_idx
  on public.generation_jobs (user_id, idempotency_key)
  where idempotency_key is not null;

create index generation_jobs_user_id_created_at_idx on public.generation_jobs (user_id, created_at desc);

alter table public.generation_jobs enable row level security;

-- "My works" reads its own jobs; status changes only happen in the job functions.
create policy "generation_jobs_select_own" on public.generation_jobs
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Grants are explicit: newer Supabase stacks no longer grant table access by default.
revoke all on public.generation_jobs from anon, authenticated;
grant select on public.generation_jobs to authenticated, service_role;
